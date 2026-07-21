from flask import Flask, render_template, request, jsonify, send_file
from groq import Groq
from dotenv import load_dotenv
from reportlab.pdfgen import canvas
import io
import os

load_dotenv()

client = Groq(api_key=os.getenv("GROQ_API_KEY"))

app = Flask(__name__)

@app.route("/")
def home():
    return render_template("index.html")


@app.route("/predict", methods=["POST"])
def predict():
    data = request.get_json()
    email = data.get("message")

    prompt = f"""
You are a professional customer support agent.

Write a polite, helpful, and clear email reply.

Customer Email:
{email}

End with:
Best Regards,
Customer Support Team
"""

    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}]
        )

        reply = response.choices[0].message.content

    except Exception as e:
        reply = f"Error: {str(e)}"

    return jsonify({"reply": reply})


@app.route("/download", methods=["POST"])
def download():
    reply = request.form["reply"]

    pdf = io.BytesIO()
    c = canvas.Canvas(pdf)

    text = c.beginText(40, 800)

    for line in reply.split("\n"):
        text.textLine(line)

    c.drawText(text)
    c.save()

    pdf.seek(0)

    return send_file(
        pdf,
        as_attachment=True,
        download_name="AI_Email_Reply.pdf",
        mimetype="application/pdf"
    )


if __name__ == "__main__":
    app.run(debug=True)