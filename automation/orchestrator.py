"""
Python Automation Orchestrator for Colombia Language Academy Assistant.
Handles automated batch customer inquiries, monitoring, lead ingestion,
and automated human escalation alert dispatch.
"""

import argparse
import datetime
import json
import logging
import os
import sys
import uuid
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


def record_escalation(payload: dict) -> dict:
    """
    Logs an urgent human escalation ticket and appends to local JSON storage.
    """
    ticket_id = f"ESC-{datetime.datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"
    timestamp = datetime.datetime.now(datetime.timezone.utc).isoformat()

    escalation_entry = {
        "ticket_id": ticket_id,
        "timestamp": timestamp,
        "status": "PENDING_HUMAN_REVIEW",
        "priority": "HIGH" if "billing" in str(payload.get("reason", "")).lower() else "MEDIUM",
        "reason": payload.get("reason", "Customer requested human advisor intervention"),
        "lead_info": payload.get("lead_info") or {},
        "inquiry": payload.get("inquiry", "N/A"),
        "ai_reply": payload.get("reply", "N/A"),
        "sources": payload.get("sources", [])
    }

    # Format human readable log message
    logging.warning(
        f"\n{'='*60}\n"
        f"[URGENT HUMAN ESCALATION DISPATCHED] Ticket: {ticket_id}\n"
        f"Timestamp: {timestamp}\n"
        f"Priority: {escalation_entry['priority']}\n"
        f"Reason: {escalation_entry['reason']}\n"
        f"Lead Contact: {json.dumps(escalation_entry['lead_info'], ensure_ascii=False)}\n"
        f"Inquiry: \"{escalation_entry['inquiry']}\"\n"
        f"{'='*60}"
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
            self.end_headers()

    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"status": "healthy", "service": "Python Automation Orchestrator"}).encode("utf-8"))
        else:
            self.send_response(404)
            self.end_headers()


def start_server(port: int = AUTOMATION_PORT):
    server_address = ("", port)
    httpd = HTTPServer(server_address, EscalationWebhookHandler)
    logging.info(f"Python Automation Orchestrator listening on http://localhost:{port}")
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
