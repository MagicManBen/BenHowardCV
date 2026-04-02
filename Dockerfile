FROM python:3.12-slim

WORKDIR /app

COPY . .

ENV DOCKER_CONTAINER=1
EXPOSE 8000

CMD ["python3", "local_server.py", "8000"]
