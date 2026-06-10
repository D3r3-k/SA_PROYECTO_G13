FROM python:3.11-slim

WORKDIR /app

COPY services/fx-service/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY proto/ /proto/
COPY services/fx-service/src/ ./src/
RUN mkdir -p /app/src/generated
RUN python -m grpc_tools.protoc \
    -I /proto \
    --python_out=/app/src/generated \
    --grpc_python_out=/app/src/generated \
    /proto/fx.proto

RUN touch /app/src/generated/__init__.py

ENV PYTHONPATH=/app/src:/app/src/generated

EXPOSE 50052

CMD ["python", "-m", "src.grpc_server"]