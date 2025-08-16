from flask import Flask
from flask_cors import CORS
from routes import api
import os 

app = Flask(__name__)
app.secret_key = os.environ.get("SESSION_SECRET", "dev-secret-key")

CORS(app)

# Register your API blueprint
app.register_blueprint(api)


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=3000, debug=True)
