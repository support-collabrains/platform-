FROM python:3.11-slim
WORKDIR /app
RUN pip install --no-cache-dir requests psycopg2-binary
COPY signal_bot.py .
CMD ["python", "-u", "signal_bot.py"]
