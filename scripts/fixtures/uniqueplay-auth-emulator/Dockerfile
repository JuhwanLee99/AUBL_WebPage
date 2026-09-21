FROM node:22-bookworm-slim
RUN npm install --global firebase-tools@15.17.0 --no-audit --no-fund
WORKDIR /fixture
COPY firebase.json ./firebase.json
ENV CI=true
ENV FIREBASE_CLI_DISABLE_UPDATE_CHECK=true
ENV FIREBASE_CLI_DISABLE_USAGE_REPORTING=true
CMD ["firebase", "emulators:start", "--only", "auth", "--project", "demo-aubl-scoped-full", "--config", "/fixture/firebase.json", "--non-interactive"]
