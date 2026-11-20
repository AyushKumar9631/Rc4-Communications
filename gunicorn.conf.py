import os

bind = "0.0.0.0:" + os.environ.get("PORT", "10000")
workers = 1  # room state is in memory, so exactly one process
worker_class = "gthread"
threads = 100  # Flask-SocketIO threading mode: one thread per connection
timeout = 120
forwarded_allow_ips = "*"  # trust Render's proxy so https/wss origin checks pass
accesslog = "-"
