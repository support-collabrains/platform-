#!/bin/sh
# Called by Paperless after each document is consumed.
# Env vars provided by Paperless: DOCUMENT_ID, DOCUMENT_OWNER, DOCUMENT_TITLE
curl -s -X POST http://api:3001/documents/consumed \
  -H "Content-Type: application/json" \
  -d "{\"documentId\":${DOCUMENT_ID},\"owner\":\"${DOCUMENT_OWNER}\",\"title\":\"${DOCUMENT_TITLE}\"}" \
  || true
