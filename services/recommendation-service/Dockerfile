FROM python:3.11-slim

WORKDIR /app
COPY services/recommendation-service/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY proto/ /proto/
COPY services/recommendation-service/src/ ./src/

RUN mkdir -p /app/src/generated
RUN python -m grpc_tools.protoc \
    -I /proto \
    --python_out=/app/src/generated \
    --grpc_python_out=/app/src/generated \
    /proto/recommendation.proto

RUN touch /app/src/generated/__init__.py
ENV PYTHONPATH=/app/src:/app/src/generated
EXPOSE 50058
CMD ["python", "-m", "src.grpc_server"]
