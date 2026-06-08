FROM python:3.11-slim

WORKDIR /app
COPY services/engagement-service/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY proto/ /proto/
COPY services/engagement-service/src/ ./src/
COPY services/engagement-service/migrations ./migrations
RUN mkdir -p /app/src/generated
RUN python -m grpc_tools.protoc \
    -I /proto \
    --python_out=/app/src/generated \
    --grpc_python_out=/app/src/generated \
    /proto/engagement.proto

RUN touch /app/src/generated/__init__.py
ENV PYTHONPATH=/app/src:/app/src/generated
EXPOSE 50056
CMD ["python", "-m", "src.grpc_server"]
