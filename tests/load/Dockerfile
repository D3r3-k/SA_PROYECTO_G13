FROM locustio/locust:2.32.6

WORKDIR /mnt/locust
COPY tests/load/requirements.txt /tmp/requirements.txt
RUN python -m pip install --no-cache-dir -r /tmp/requirements.txt
COPY tests/load/locustfile.py /mnt/locust/locustfile.py

ENTRYPOINT ["locust", "-f", "/mnt/locust/locustfile.py"]
