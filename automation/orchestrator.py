"""
Python Automation Orchestrator for Colombia Language Academy Assistant.
Handles automated batch customer inquiries, monitoring, lead ingestion,
and multi-channel escalation alert dispatch (Email, Telegram, WhatsApp Webhook).
"""

import argparse
import datetime
import json
import logging
import os
import smtplib
import sys
import urllib.parse
import uuid
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from dotenv import load_dotenv
import requests

# Load environment variables
BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

LOG_FILE = Path(__file__).resolve().parent / "escalations.log"
JSON_DB_FILE = Path(__file__).resolve().parent / "escalations.json"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE, encoding="utf-8"),
        logging.StreamHandler(sys.stdout)
    ]
)

NODE_API_URL = os.getenv("NODE_API_URL", "http://localhost:3000/api/chat")
AUTOMATION_PORT = int(os.getenv("AUTOMATION_PORT", "5000"))

# Advisor Target Notification Settings
ADVISOR_EMAIL = os.getenv("ADVISOR_EMAIL", "ddamago0@gmail.com")
ADVISOR_PHONE = os.getenv("ADVISOR_PHONE", "+573014777763")
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "")
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASS = os.getenv("SMTP_PASS", "")


def send_telegram_alert(ticket: dict) -> bool:
    """
    Sends real-time notification to Telegram Bot / Advisor Chat.
    """
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        return False

    text = (
        f"🚨 *NEW ADMISSIONS ESCALATION ALERT*\n"
        f"━━━━━━━━━━━━━━━━━━━\n"
        f"🎫 *Ticket ID:* `{ticket['ticket_id']}`\n"
        f"⚡ *Priority:* {ticket['priority']}\n"
        f"📌 *Reason:* {ticket['reason']}\n"
        f"👤 *Lead:* {json.dumps(ticket['lead_info'], ensure_ascii=False)}\n"
        f"💬 *Inquiry:* \"{ticket['inquiry']}\"\n"
        f"⏰ *Time:* {ticket['timestamp']}\n"
        f"━━━━━━━━━━━━━━━━━━━\n"
        f"📞 *Assigned Advisor:* {ADVISOR_PHONE} ({ADVISOR_EMAIL})"
    )

    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    try:
        res = requests.post(url, json={"chat_id": TELEGRAM_CHAT_ID, "text": text, "parse_mode": "Markdown"}, timeout=5)
        if res.status_code == 200:
            logging.info(f"[Telegram Alert] Sent successfully to chat {TELEGRAM_CHAT_ID}")
            return True
        else:
            logging.warning(f"[Telegram Alert] Telegram API returned status {res.status_code}: {res.text}")
    except Exception as e:
        logging.warning(f"[Telegram Alert] Could not send Telegram message: {e}")
    return False


def send_email_alert(ticket: dict) -> bool:
    """
    Sends formatted HTML email alert to the advisor's email address.
    """
    if not SMTP_USER or not SMTP_PASS or not ADVISOR_EMAIL:
        return False

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"[Escalation Alert] {ticket['priority']} Priority: Ticket {ticket['ticket_id']}"
        msg["From"] = f"Colombia Language Academy Bot <{SMTP_USER}>"
        msg["To"] = ADVISOR_EMAIL

        html_body = f"""
        <html>
          <body style="font-family: Arial, sans-serif; background: #f8fafc; padding: 20px; color: #1e293b;">
            <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; padding: 25px;">
              <h2 style="color: #dc2626; margin-top: 0;">🚨 Urgent Admissions Escalation Dispatched</h2>
              <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                <tr><td style="padding: 8px; font-weight: bold; width: 140px;">Ticket ID:</td><td style="padding: 8px; font-family: monospace;">{ticket['ticket_id']}</td></tr>
                <tr style="background: #f1f5f9;"><td style="padding: 8px; font-weight: bold;">Priority:</td><td style="padding: 8px; color: #dc2626;">{ticket['priority']}</td></tr>
                <tr><td style="padding: 8px; font-weight: bold;">Reason:</td><td style="padding: 8px;">{ticket['reason']}</td></tr>
                <tr style="background: #f1f5f9;"><td style="padding: 8px; font-weight: bold;">Lead Info:</td><td style="padding: 8px;">{json.dumps(ticket['lead_info'], ensure_ascii=False)}</td></tr>
                <tr><td style="padding: 8px; font-weight: bold;">Customer Inquiry:</td><td style="padding: 8px; font-style: italic;">"{ticket['inquiry']}"</td></tr>
                <tr style="background: #f1f5f9;"><td style="padding: 8px; font-weight: bold;">Timestamp:</td><td style="padding: 8px;">{ticket['timestamp']}</td></tr>
              </table>
              <div style="background: #ecfdf5; border-left: 4px solid #10b981; padding: 12px; border-radius: 4px; font-size: 14px;">
                <strong>Assigned Advisor:</strong> {ADVISOR_EMAIL} | WhatsApp: {ADVISOR_PHONE}
              </div>
            </div>
          </body>
        </html>
        """
        msg.attach(MIMEText(html_body, "html"))

        server = smtplib.SMTP(SMTP_HOST, SMTP_PORT)
        server.starttls()
        server.login(SMTP_USER, SMTP_PASS)
        server.sendmail(SMTP_USER, [ADVISOR_EMAIL], msg.as_string())
        server.quit()
        logging.info(f"[Email Alert] Successfully sent escalation notification to {ADVISOR_EMAIL}")
        return True
    except Exception as e:
        logging.warning(f"[Email Alert] Could not send SMTP email: {e}")
        return False


def record_escalation(payload: dict) -> dict:
    """
    Logs an urgent human escalation ticket, generates WhatsApp action links,
    and dispatches Email/Telegram alerts.
    """
    ticket_id = f"ESC-{datetime.datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"
    timestamp = datetime.datetime.now(datetime.timezone.utc).isoformat()
    reason = payload.get("reason", "Customer requested human advisor intervention")
    lead_info = payload.get("lead_info") or {}
    inquiry = payload.get("inquiry", "N/A")

    # Generate direct WhatsApp click-to-reply URL
    wa_text = urllib.parse.quote(f"Hello! I am contacting you regarding your Language Academy ticket [{ticket_id}]: {reason}")
    wa_link = f"https://api.whatsapp.com/send?phone={ADVISOR_PHONE.replace('+', '').replace(' ', '')}&text={wa_text}"

    escalation_entry = {
        "ticket_id": ticket_id,
        "timestamp": timestamp,
        "status": "PENDING_HUMAN_REVIEW",
        "priority": "HIGH" if "billing" in str(reason).lower() else "MEDIUM",
        "reason": reason,
        "lead_info": lead_info,
        "inquiry": inquiry,
        "ai_reply": payload.get("reply", "N/A"),
        "sources": payload.get("sources", []),
        "assigned_to": {
            "advisor_email": ADVISOR_EMAIL,
            "advisor_phone": ADVISOR_PHONE,
            "whatsapp_action_link": wa_link
        }
    }

    # Format human readable log message
    logging.warning(
        f"\n{'='*65}\n"
        f"[URGENT HUMAN ESCALATION DISPATCHED] Ticket: {ticket_id}\n"
        f"Timestamp: {timestamp}\n"
        f"Priority: {escalation_entry['priority']}\n"
        f"Reason: {reason}\n"
        f"Lead Contact: {json.dumps(lead_info, ensure_ascii=False)}\n"
        f"Inquiry: \"{inquiry}\"\n"
        f"Advisor Notification: {ADVISOR_EMAIL} | WhatsApp: {ADVISOR_PHONE}\n"
        f"Direct WhatsApp Link: {wa_link}\n"
        f"{'='*65}"
    )

    # Persist to escalations.json
    try:
        data = []
        if JSON_DB_FILE.exists():
            with open(JSON_DB_FILE, "r", encoding="utf-8") as f:
                try:
                    data = json.load(f)
                except json.JSONDecodeError:
                    data = []
        data.append(escalation_entry)
        with open(JSON_DB_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
    except Exception as e:
        logging.error(f"Failed to persist escalation ticket to JSON store: {e}")

    # Dispatch alerts
    send_telegram_alert(escalation_entry)
    send_email_alert(escalation_entry)

    return escalation_entry


class EscalationWebhookHandler(BaseHTTPRequestHandler):
    """
    HTTP Server handling incoming webhook triggers from Node.js backend.
    """
    def do_POST(self):
        if self.path in ["/webhook/escalations", "/webhook/leads"]:
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length)
            try:
                payload = json.loads(body.decode("utf-8"))
                result = record_escalation(payload)
                
                response_data = {
                    "status": "success",
                    "action": "human_escalation_recorded",
                    "ticket": result
                }
                
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps(response_data).encode("utf-8"))
            except Exception as e:
                logging.error(f"Error processing webhook request: {e}")
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"status": "error", "message": str(e)}).encode("utf-8"))
        else:
            self.send_response(404)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": f"Endpoint not found: {self.path}"}).encode("utf-8"))

    def do_GET(self):
        if self.path == "/" or self.path == "/index.html":
            html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Python Automation Service - Colombia Language Academy</title>
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 40px 20px; display: flex; justify-content: center; }}
    .card {{ background: #1e293b; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; max-width: 650px; width: 100%; padding: 30px; box-shadow: 0 10px 25px rgba(0,0,0,0.3); }}
    h1 {{ color: #34d399; font-size: 1.5rem; margin-top: 0; }}
    p {{ color: #94a3b8; line-height: 1.6; }}
    .status {{ display: inline-flex; align-items: center; gap: 8px; background: rgba(52, 211, 153, 0.15); color: #34d399; padding: 4px 12px; border-radius: 20px; font-size: 0.85rem; font-weight: 600; margin-bottom: 20px; }}
    .dot {{ width: 8px; height: 8px; background: #34d399; border-radius: 50%; }}
    .btn {{ display: inline-block; background: linear-gradient(135deg, #059669, #10b981); color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; margin-top: 15px; transition: transform 0.15s; }}
    .btn:hover {{ transform: scale(1.02); }}
    .info-box {{ background: rgba(0,0,0,0.25); border-left: 4px solid #3b82f6; padding: 15px; border-radius: 4px; margin: 20px 0; font-size: 0.9rem; }}
    code {{ font-family: monospace; color: #93c5fd; background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 4px; }}
  </style>
</head>
<body>
  <div class="card">
    <div class="status"><span class="dot"></span> Python Automation Service Running</div>
    <h1>Admissions Escalation Orchestrator</h1>
    <p>This backend daemon processes automated escalation alerts, logs urgent human tickets, and connects with Advisor notification channels.</p>
    
    <div class="info-box">
      <strong>Notification Dispatcher Configured:</strong><br>
      • Primary Advisor Email: <code>{ADVISOR_EMAIL}</code><br>
      • WhatsApp / Telegram Target: <code>{ADVISOR_PHONE}</code><br>
      • Active Webhook: <code>POST /webhook/escalations</code><br>
      • Log File: <code>automation/escalations.log</code>
    </div>

    <p>To use the <strong>Interactive Chat Assistant Web UI</strong>, please open the main Node.js application:</p>
    <a href="http://localhost:3000" class="btn">👉 Open Main Web UI (localhost:3000)</a>
  </div>
</body>
</html>"""
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(html_content.encode("utf-8"))
        elif self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({
                "status": "healthy",
                "service": "Python Automation Orchestrator",
                "port": AUTOMATION_PORT,
                "advisor_email": ADVISOR_EMAIL,
                "advisor_phone": ADVISOR_PHONE
            }).encode("utf-8"))
        else:
            self.send_response(404)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": f"Endpoint not found: {self.path}"}).encode("utf-8"))


def start_server(port: int = AUTOMATION_PORT):
    server_address = ("", port)
    httpd = HTTPServer(server_address, EscalationWebhookHandler)
    logging.info(f"Python Automation Orchestrator listening on http://localhost:{port}")
    logging.info(f"- Target Advisor: {ADVISOR_EMAIL} | WhatsApp/Telegram: {ADVISOR_PHONE}")
    logging.info(f"- Webhook Endpoint: http://localhost:{port}/webhook/escalations")
    logging.info(f"- Health Check: http://localhost:{port}/health")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        logging.info("Shutting down automation orchestrator server...")
        httpd.server_close()


def run_batch_simulation():
    """
    Simulates a batch of incoming student inquiries through the Node.js API
    to test grounding and automated escalation dispatching.
    """
    test_inquiries = [
        {
            "inquiry": "What is the cost of the standard English course and what are the payment methods in Colombia?",
            "expected_escalate": False
        },
        {
            "inquiry": "Do you offer official IELTS preparation courses and what attendance is required?",
            "expected_escalate": False
        },
        {
            "inquiry": "I need to talk to a manager immediately about an incorrect credit card charge. My name is Laura Mejia and my phone is 3158889900.",
            "expected_escalate": True
        },
        {
            "inquiry": "We represent a multinational company with 200 employees looking for a corporate customized Portuguese program. Please have a corporate advisor contact us at corporate@empresa.com.",
            "expected_escalate": True
        }
    ]

    logging.info(f"Starting batch simulation for {len(test_inquiries)} customer inquiries...")
    summary = {"total": len(test_inquiries), "successful": 0, "escalated": 0}

    for i, item in enumerate(test_inquiries, 1):
        inquiry = item["inquiry"]
        logging.info(f"\n--- [Batch Item {i}/{len(test_inquiries)}] Inquiry: \"{inquiry}\" ---")
        try:
            res = requests.post(NODE_API_URL, json={"message": inquiry}, timeout=15)
            if res.status_code == 200:
                data = res.json()
                is_escalate = data.get("escalate", False)
                logging.info(f"Response Status: 200 OK | Escalated: {is_escalate}")
                logging.info(f"Reply: {data.get('reply')[:120]}...")
                
                if is_escalate:
                    summary["escalated"] += 1
                    # Dispatch to local escalation record
                    record_escalation({
                        "reason": data.get("reason"),
                        "lead_info": data.get("lead_info"),
                        "inquiry": inquiry,
                        "reply": data.get("reply"),
                        "sources": data.get("sources", [])
                    })
                summary["successful"] += 1
            else:
                logging.error(f"Node API returned status {res.status_code}: {res.text}")
        except Exception as e:
            logging.error(f"Failed to connect to Node.js backend ({NODE_API_URL}): {e}")

    logging.info(f"\nSimulation Finished: Total: {summary['total']}, Successful: {summary['successful']}, Escalations Logged: {summary['escalated']}")


def print_summary():
    """
    Displays recent escalation records from escalations.json
    """
    if not JSON_DB_FILE.exists():
        print("No escalation tickets found.")
        return
    with open(JSON_DB_FILE, "r", encoding="utf-8") as f:
        tickets = json.load(f)
    print(f"\nTotal Escalation Tickets: {len(tickets)}")
    print("-" * 70)
    for t in tickets[-5:]:
        print(f"[{t['ticket_id']}] Priority: {t.get('priority')} | Reason: {t.get('reason')}")
        print(f"  Lead: {t.get('lead_info')}")
        print(f"  Assigned Advisor: {t.get('assigned_to', {}).get('advisor_email')} ({t.get('assigned_to', {}).get('advisor_phone')})")
        print(f"  Timestamp: {t.get('timestamp')}")
        print("-" * 70)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Colombia Language Academy Python Automation Orchestrator")
    parser.add_argument("--mode", choices=["server", "batch", "summary"], default="server", help="Execution mode")
    parser.add_argument("--port", type=int, default=AUTOMATION_PORT, help="Port for webhook server")
    args = parser.parse_args()

    if args.mode == "server":
        start_server(args.port)
    elif args.mode == "batch":
        run_batch_simulation()
    elif args.mode == "summary":
        print_summary()
