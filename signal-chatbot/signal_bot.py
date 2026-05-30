#!/usr/bin/env python3
import os
import time
import requests
import psycopg2
from pathlib import Path

# Environment variabelen (worden via docker-compose meegegeven)
SIGNAL_API_URL = os.environ.get('SIGNAL_API_URL', 'http://platform-signal-api-1:8080')
DB_HOST = os.environ['DB_HOST']
DB_NAME = os.environ['DB_NAME']
DB_USER = os.environ['DB_USER']
DB_PASSWORD = os.environ['DB_PASSWORD']
PAPERLESS_URL = os.environ.get('PAPERLESS_URL', 'http://platform-paperless-1:8000')
PAPERLESS_TOKEN = os.environ['PAPERLESS_TOKEN']  # Admin token (moet bestaan)

# Verbinding met PostgreSQL (user_attributes tabel)
def get_db_connection():
    return psycopg2.connect(
        host=DB_HOST,
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD
    )

def get_username_by_phone(phone_number):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT username FROM user_attributes WHERE phone_number = %s", (phone_number,))
    row = cur.fetchone()
    cur.close()
    conn.close()
    return row[0] if row else None

def send_signal_message(to_number, text):
    try:
        requests.post(f"{SIGNAL_API_URL}/v1/send", json={"to": to_number, "message": text}, timeout=10)
    except Exception as e:
        print(f"Fout bij verzenden: {e}")

def post_to_paperless(username, files, text_content, sender):
    """Stuur document(en) naar Paperless voor een specifieke gebruiker."""
    headers = {"Authorization": f"Token {PAPERLESS_TOKEN}"}
    data = {
        "title": f"Signal bericht van {sender}",
        "owner": username,
        "tags": "Signal",
        "created": time.strftime("%Y-%m-%d"),
    }
    # Als er geen bestanden zijn, stuur dan de tekst als .txt bestand
    if not files and text_content:
        files = [("document", ("message.txt", text_content))]
    if not files:
        return False
    try:
        response = requests.post(f"{PAPERLESS_URL}/api/documents/post_document/", data=data, files=files, headers=headers, timeout=30)
        if response.status_code == 200:
            return True
        else:
            print(f"Paperless fout: {response.status_code} - {response.text}")
            return False
    except Exception as e:
        print(f"Fout bij posten naar Paperless: {e}")
        return False

def download_attachment(attachment_id):
    try:
        resp = requests.get(f"{SIGNAL_API_URL}/v1/attachments/{attachment_id}", timeout=20)
        if resp.status_code == 200:
            # Bepaal bestandsnaam uit headers of gebruik ID
            content_disposition = resp.headers.get('Content-Disposition', '')
            filename = f"attachment_{attachment_id}"
            if 'filename=' in content_disposition:
                filename = content_disposition.split('filename=')[-1].strip('"')
            return (filename, resp.content)
        else:
            print(f"Kan attachment {attachment_id} niet downloaden")
            return None
    except Exception as e:
        print(f"Fout bij downloaden attachment: {e}")
        return None

def process_messages(last_timestamp):
    try:
        resp = requests.get(f"{SIGNAL_API_URL}/v1/receive/{last_timestamp}", timeout=10)
        if resp.status_code != 200:
            return last_timestamp
        data = resp.json()
        messages = data.get("messages", [])
        for msg in messages:
            sender = msg.get("source")
            recipient = msg.get("destination")  # het nummer waar het bericht naar is gestuurd
            text = msg.get("message", "")
            attachments = msg.get("attachments", [])
            # Zoek Paperless gebruiker op basis van ontvanger nummer
            username = get_username_by_phone(recipient)
            if not username:
                print(f"Geen gebruiker gevonden voor ontvanger {recipient}")
                # Optioneel: stuur een bericht terug naar afzender
                send_signal_message(sender, "Dit nummer is niet gekoppeld aan een Paperless gebruiker.")
                continue

            # Bepaal of we iets moeten archiveren
            should_archive = bool(attachments) or (text.strip().lower().startswith("!inbox"))

            if should_archive:
                files = []
                # Download alle attachments
                for att_id in attachments:
                    att_file = download_attachment(att_id)
                    if att_file:
                        files.append(("document", att_file))
                # Als er geen attachments maar wel !inbox tekst, maak een tekstbestand aan
                cleaned_text = text.replace("!inbox", "").strip() if text.lower().startswith("!inbox") else text
                if not files and cleaned_text:
                    files.append(("document", ("bericht.txt", cleaned_text)))
                if files:
                    success = post_to_paperless(username, files, cleaned_text, sender)
                    if success:
                        send_signal_message(sender, "✅ Document is opgeslagen in Paperless.")
                    else:
                        send_signal_message(sender, "❌ Fout bij opslaan in Paperless. Neem contact op met beheerder.")
                else:
                    send_signal_message(sender, "Geen geldige inhoud om op te slaan.")
            else:
                # Stuur een help bericht
                help_msg = (
                    "📄 *Paperless Signal Bot*\n"
                    "Stuur een afbeelding, PDF of tekstbestand naar dit nummer, "
                    "of typ `!inbox` om dit bericht op te slaan in Paperless.\n"
                    "Berichten worden toegevoegd aan jouw Paperless inbox."
                )
                send_signal_message(sender, help_msg)
        # Return de laatste timestamp van de meest recente message
        if messages:
            last_timestamp = max(msg.get("timestamp", last_timestamp) for msg in messages) + 1
        else:
            last_timestamp = int(time.time())
    except Exception as e:
        print(f"Fout bij ophalen berichten: {e}")
    return last_timestamp

def main():
    print("Signal Chatbot gestart")
    last_ts = int(time.time()) - 60  # haal laatste minuut op
    while True:
        last_ts = process_messages(last_ts)
        time.sleep(5)

if __name__ == "__main__":
    main()
