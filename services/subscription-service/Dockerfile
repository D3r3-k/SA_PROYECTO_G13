FROM python:3.11-slim

WORKDIR /app

COPY services/subscription-service/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY proto/ /proto/
COPY services/subscription-service/src/ ./src/

RUN python -m grpc_tools.protoc \
    -I /proto \
    --python_out=/app/src/generated \
    --grpc_python_out=/app/src/generated \
    /proto/subscription.proto /proto/identity.proto /proto/notification.proto

RUN touch /app/src/generated/__init__.py

ENV PYTHONPATH=/app/src:/app/src/generated

EXPOSE 50053

CMD ["python", "-m", "src.grpc_server"]