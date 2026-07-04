import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { generateText } from "ai";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

function serverSupabase() {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

const InputSchema = z.object({ inquiryId: z.string().uuid() });

export const generateAiReply = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");
    const supabase = serverSupabase();

    const { data: inquiry, error } = await supabase
      .from("inquiries")
      .select("*, orders(*)")
      .eq("id", data.inquiryId)
      .single();
    if (error || !inquiry) throw new Error(error?.message ?? "Inquiry not found");

    const order = (inquiry as unknown as { orders: Database["public"]["Tables"]["orders"]["Row"] | null }).orders;

    const orderContext = order
      ? `MATCHED ORDER:
- Order number: ${order.order_number}
- Status: ${order.status}
- Customer: ${order.customer_name} <${order.customer_email}>
- Items: ${JSON.stringify(order.items)}
- Total: $${order.total_amount}
- Tracking: ${order.tracking_number ?? "not yet available"} (${order.carrier ?? "n/a"})
- Estimated delivery: ${order.estimated_delivery ?? "n/a"}
- Shipping to: ${order.shipping_address ?? "n/a"}`
      : "NO MATCHING ORDER FOUND in our system for this email address.";

    const gateway = createLovableAiGatewayProvider(key);
    const model = gateway("google/gemini-3-flash-preview");

    const systemPrompt = `You are a customer support agent for a small independent home-goods brand called "Northlight & Co."
Voice: warm, concise, human. Never robotic. Sign as "The Northlight Team".
Always:
- Use the customer's first name.
- Reference the order number if we have one.
- Give specific, factual info from the order context — never invent tracking numbers or dates.
- If you can't fulfil the request from the data (e.g. cancellation, refund, replacement), acknowledge it, explain the next step, and say a team member will follow up within one business day.
- Never promise timelines that aren't in the order data.
- Keep replies under 150 words.`;

    const userPrompt = `Customer inquiry:
From: ${inquiry.customer_name ?? "Unknown"} <${inquiry.customer_email}>
Subject: ${inquiry.subject}
Body: ${inquiry.body}

${orderContext}

Return your response in this exact format (no extra commentary):
INTENT: <one of: order_status, cancellation, refund, damaged_item, shipping_question, general_question, other>
SUMMARY: <one sentence summarizing what the customer wants>
REPLY:
<the full email reply, starting with "Hi <first name>,">`;

    const { text } = await generateText({
      model,
      system: systemPrompt,
      prompt: userPrompt,
    });

    const intentMatch = text.match(/INTENT:\s*(.+)/i);
    const summaryMatch = text.match(/SUMMARY:\s*(.+)/i);
    const replyMatch = text.match(/REPLY:\s*([\s\S]+)$/i);

    const intent = intentMatch?.[1]?.trim() ?? "other";
    const summary = summaryMatch?.[1]?.trim() ?? "";
    const reply = replyMatch?.[1]?.trim() ?? text.trim();

    const { data: updated, error: upErr } = await supabase
      .from("inquiries")
      .update({
        intent,
        ai_summary: summary,
        ai_draft_reply: reply,
        status: inquiry.status === "pending" ? "drafted" : inquiry.status,
      })
      .eq("id", data.inquiryId)
      .select()
      .single();
    if (upErr) throw new Error(upErr.message);

    return updated;
  });
