FROM python:3.12-slim
WORKDIR /srv
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY collector ./collector
COPY exporter ./exporter
COPY ["docs/AI SDLC Maturity.xlsx", "./docs/AI SDLC Maturity.xlsx"]
EXPOSE 8000
CMD ["uvicorn", "exporter.app:app", "--host", "0.0.0.0", "--port", "8000"]
