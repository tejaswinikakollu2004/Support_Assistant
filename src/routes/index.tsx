import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Sparkles,
  Send,
  Mail,
  Package,
  CheckCircle2,
  Clock,
  AlertCircle,
  Inbox,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { generateAiReply } from "@/lib/inquiries.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";

type Inquiry = Database["public"]["Tables"]["inquiries"]["Row"];
type Order = Database["public"]["Tables"]["orders"]["Row"];

export const Route = createFileRoute("/")({
  component: Dashboard,
});

const STATUS_META: Record<string, { label: string; className: string; icon: typeof Clock }> = {
  pending: { label: "New", className: "bg-amber-100 text-amber-900 border-amber-200", icon: Clock },
  drafted: { label: "Draft ready", className: "bg-sky-100 text-sky-900 border-sky-200", icon: Sparkles },
  sent: { label: "Replied", className: "bg-emerald-100 text-emerald-900 border-emerald-200", icon: CheckCircle2 },
};

function useInquiries() {
  return useQuery({
    queryKey: ["inquiries"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inquiries")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Inquiry[];
    },
  });
}

function useOrder(orderId: string | null) {
  return useQuery({
    queryKey: ["order", orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select("*").eq("id", orderId!).single();
      if (error) throw error;
      return data as Order;
    },
  });
}

function Dashboard() {
  const qc = useQueryClient();
  const { data: inquiries, isLoading } = useInquiries();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const selected = inquiries?.find((i) => i.id === selectedId) ?? null;

  useEffect(() => {
    if (!selectedId && inquiries && inquiries.length > 0) {
      setSelectedId(inquiries[0].id);
    }
  }, [inquiries, selectedId]);

  useEffect(() => {
    setDraft(selected?.ai_draft_reply ?? "");
  }, [selected?.id, selected?.ai_draft_reply]);

  const { data: order } = useOrder(selected?.order_id ?? null);

  const generate = useServerFn(generateAiReply);
  const generateMut = useMutation({
    mutationFn: async (id: string) => generate({ data: { inquiryId: id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inquiries"] });
      toast.success("Draft reply generated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sendMut = useMutation({
    mutationFn: async ({ id, reply }: { id: string; reply: string }) => {
      const { error } = await supabase
        .from("inquiries")
        .update({ sent_reply: reply, sent_at: new Date().toISOString(), status: "sent" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inquiries"] });
      toast.success("Reply marked as sent");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const counts = {
    pending: inquiries?.filter((i) => i.status === "pending").length ?? 0,
    drafted: inquiries?.filter((i) => i.status === "drafted").length ?? 0,
    sent: inquiries?.filter((i) => i.status === "sent").length ?? 0,
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Toaster position="top-right" />
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white">
              <Mail className="h-4 w-4" />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight text-slate-900">
                Northlight Support Desk
              </h1>
              <p className="text-xs text-slate-500">AI agent for customer email · demo</p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-600">
            <Stat icon={AlertCircle} label="New" value={counts.pending} />
            <Stat icon={Sparkles} label="Drafted" value={counts.drafted} />
            <Stat icon={CheckCircle2} label="Sent" value={counts.sent} />
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl grid-cols-12 gap-6 px-6 py-6">
        {/* Inbox */}
        <aside className="col-span-4">
          <div className="rounded-xl border bg-white">
            <div className="flex items-center gap-2 border-b px-4 py-3">
              <Inbox className="h-4 w-4 text-slate-500" />
              <h2 className="text-sm font-medium text-slate-900">Inbox</h2>
              <span className="ml-auto text-xs text-slate-500">{inquiries?.length ?? 0}</span>
            </div>
            <ul className="divide-y">
              {isLoading && <li className="p-6 text-sm text-slate-500">Loading…</li>}
              {inquiries?.map((i) => {
                const meta = STATUS_META[i.status] ?? STATUS_META.pending;
                const Icon = meta.icon;
                return (
                  <li key={i.id}>
                    <button
                      onClick={() => setSelectedId(i.id)}
                      className={cn(
                        "w-full px-4 py-3 text-left transition-colors hover:bg-slate-50",
                        selectedId === i.id && "bg-slate-100",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-slate-900">
                          {i.customer_name ?? i.customer_email}
                        </span>
                        <Badge variant="outline" className={cn("gap-1 border text-[10px]", meta.className)}>
                          <Icon className="h-3 w-3" /> {meta.label}
                        </Badge>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-slate-600">{i.subject}</p>
                      <p className="mt-1 line-clamp-2 text-xs text-slate-500">{i.body}</p>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </aside>

        {/* Detail */}
        <section className="col-span-8 space-y-4">
          {!selected ? (
            <div className="rounded-xl border bg-white p-12 text-center text-sm text-slate-500">
              Select an inquiry to view details.
            </div>
          ) : (
            <>
              <div className="rounded-xl border bg-white p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">{selected.subject}</h2>
                    <p className="mt-1 text-sm text-slate-600">
                      From{" "}
                      <span className="font-medium text-slate-900">
                        {selected.customer_name ?? selected.customer_email}
                      </span>{" "}
                      <span className="text-slate-400">·</span> {selected.customer_email}
                    </p>
                  </div>
                  {selected.intent && (
                    <Badge variant="outline" className="capitalize">
                      {selected.intent.replace(/_/g, " ")}
                    </Badge>
                  )}
                </div>
                <div className="mt-4 whitespace-pre-wrap rounded-lg bg-slate-50 p-4 text-sm text-slate-800">
                  {selected.body}
                </div>
                {selected.ai_summary && (
                  <div className="mt-3 rounded-lg border border-sky-100 bg-sky-50 p-3 text-xs text-sky-900">
                    <span className="font-semibold">AI summary: </span>
                    {selected.ai_summary}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2 rounded-xl border bg-white p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-900">Reply</h3>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={generateMut.isPending}
                      onClick={() => generateMut.mutate(selected.id)}
                    >
                      <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                      {generateMut.isPending
                        ? "Drafting…"
                        : selected.ai_draft_reply
                          ? "Regenerate"
                          : "Generate AI draft"}
                    </Button>
                  </div>
                  <Textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Click 'Generate AI draft' to have the agent write a reply, or type your own here."
                    className="min-h-[220px] resize-y font-mono text-sm"
                  />
                  <div className="mt-3 flex items-center justify-between">
                    <p className="text-xs text-slate-500">
                      {selected.sent_at
                        ? `Sent ${new Date(selected.sent_at).toLocaleString()}`
                        : "Review before sending. You can edit anything."}
                    </p>
                    <Button
                      disabled={!draft.trim() || sendMut.isPending}
                      onClick={() => sendMut.mutate({ id: selected.id, reply: draft })}
                    >
                      <Send className="mr-1.5 h-3.5 w-3.5" />
                      {selected.status === "sent" ? "Re-send" : "Mark as sent"}
                    </Button>
                  </div>
                </div>

                <OrderPanel order={order ?? null} matchedNumber={selected.matched_order_number} />
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className="h-3.5 w-3.5 text-slate-400" />
      <span className="font-medium text-slate-900">{value}</span>
      <span className="text-slate-500">{label}</span>
    </div>
  );
}

function OrderPanel({ order, matchedNumber }: { order: Order | null; matchedNumber: string | null }) {
  return (
    <div className="col-span-1 rounded-xl border bg-white p-5">
      <div className="mb-3 flex items-center gap-2">
        <Package className="h-4 w-4 text-slate-500" />
        <h3 className="text-sm font-semibold text-slate-900">Order</h3>
      </div>
      {!order ? (
        <p className="text-xs text-slate-500">
          {matchedNumber
            ? `No record found for ${matchedNumber}.`
            : "No order matched to this inquiry."}
        </p>
      ) : (
        <dl className="space-y-2 text-xs">
          <Row label="Number" value={order.order_number} />
          <Row label="Status" value={<span className="capitalize">{order.status}</span>} />
          <Row label="Total" value={`$${order.total_amount}`} />
          {order.tracking_number && <Row label="Tracking" value={order.tracking_number} />}
          {order.carrier && <Row label="Carrier" value={order.carrier} />}
          {order.estimated_delivery && (
            <Row label="ETA" value={new Date(order.estimated_delivery).toLocaleDateString()} />
          )}
          <div className="pt-2">
            <p className="mb-1 text-[10px] uppercase tracking-wide text-slate-400">Items</p>
            <ul className="space-y-1">
              {(order.items as Array<{ name: string; qty: number; price: number }>).map((it, i) => (
                <li key={i} className="flex justify-between text-slate-700">
                  <span>
                    {it.qty}× {it.name}
                  </span>
                  <span className="text-slate-500">${it.price}</span>
                </li>
              ))}
            </ul>
          </div>
        </dl>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-900">{value}</dd>
    </div>
  );
}
