# sandbox/Dockerfile
# NeuraLaunch Universal Sandbox - Supports Node, Python, Go, Rust, PHP, Ruby
FROM ubuntu:22.04

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_VERSION=20
ENV PYTHON_VERSION=3.11
ENV GO_VERSION=1.21.5
ENV RUST_VERSION=stable

# ==========================================
# SYSTEM PACKAGES & TOOLS
# ==========================================

RUN apt-get update && apt-get install -y \
    # Core utilities
    curl \
    wget \
    git \
    ca-certificates \
    gnupg \
    build-essential \
    software-properties-common \
    # Required for various build processes
    pkg-config \
    libssl-dev \
    # Clean up
    && rm -rf /var/lib/apt/lists/*

# ==========================================
# NODE.JS & NPM
# ==========================================

RUN curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g npm@latest pnpm@latest yarn \
    && rm -rf /var/lib/apt/lists/*

# ==========================================
# PYTHON
# ==========================================

RUN apt-get update && apt-get install -y \
    python${PYTHON_VERSION} \
    python${PYTHON_VERSION}-dev \
    python${PYTHON_VERSION}-venv \
    python3-pip \
    && update-alternatives --install /usr/bin/python python /usr/bin/python${PYTHON_VERSION} 1 \
    && update-alternatives --install /usr/bin/python3 python3 /usr/bin/python${PYTHON_VERSION} 1 \
    && rm -rf /var/lib/apt/lists/*

# Install common Python tools and development dependencies
RUN pip3 install --no-cache-dir \
    pip \
    setuptools \
    wheel \
    poetry \
    pipenv \
    virtualenv \
    pytest \
    pytest-cov \
    pytest-asyncio \
    pylint \
    bandit \
    black \
    flake8 \
    mypy

# ==========================================
# CREATE NON-ROOT USER (SECURITY)
# ==========================================

RUN groupadd -r neura && useradd -r -g neura -m -s /bin/bash neura

# ==========================================
# GO
# ==========================================

RUN wget -q https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz \
    && tar -C /usr/local -xzf go${GO_VERSION}.linux-amd64.tar.gz \
    && rm go${GO_VERSION}.linux-amd64.tar.gz

ENV PATH="/usr/local/go/bin:${PATH}"
ENV GOPATH="/home/neura/go"
ENV PATH="${GOPATH}/bin:${PATH}"

# ==========================================
# RUST (install as neura user)
# ==========================================

USER neura
ENV HOME="/home/neura"
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain ${RUST_VERSION} \
    && . "$HOME/.cargo/env" \
    && rustup component add clippy rustfmt
USER root

ENV PATH="/home/neura/.cargo/bin:${PATH}"

# ==========================================
# PHP
# ==========================================

RUN apt-get update && apt-get install -y \
    php8.1 \
    php8.1-cli \
    php8.1-common \
    php8.1-curl \
    php8.1-mbstring \
    php8.1-xml \
    php8.1-zip \
    composer \
    && rm -rf /var/lib/apt/lists/*

# ==========================================
# RUBY
# ==========================================

RUN apt-get update && apt-get install -y \
    ruby-full \
    && gem install bundler rails \
    && rm -rf /var/lib/apt/lists/*

# ==========================================
# JAVA (OpenJDK 17)
# ==========================================

RUN apt-get update && apt-get install -y \
    openjdk-17-jdk \
    maven \
    gradle \
    && rm -rf /var/lib/apt/lists/*

ENV JAVA_HOME="/usr/lib/jvm/java-17-openjdk-amd64"
ENV PATH="${JAVA_HOME}/bin:${PATH}"

# ==========================================
# DATABASE CLIENTS
# ==========================================

RUN apt-get update && apt-get install -y \
    postgresql-client \
    mysql-client \
    redis-tools \
    && rm -rf /var/lib/apt/lists/*

# ==========================================
# SANDBOX API SERVER
# ==========================================

WORKDIR /app

# Install Node.js dependencies for sandbox server
RUN npm install express pusher

# Copy sandbox server
COPY sandbox-server.js .

# Create workspace directory with proper ownership
RUN mkdir -p /workspace \
    && chown -R neura:neura /workspace \
    && chmod 755 /workspace

# ==========================================
# VERIFY INSTALLATIONS
# ==========================================

RUN echo "=== Verifying Installations ===" \
    && node --version \
    && npm --version \
    && python --version \
    && pip --version \
    && go version \
    && rustc --version \
    && cargo --version \
    && php --version \
    && composer --version \
    && ruby --version \
    && java --version \
    && mvn --version \
    && git --version \
    && echo "=== All runtimes installed successfully ==="

# ==========================================
# RUNTIME CONFIGURATION
# ==========================================

# Ensure app directory is accessible by neura
RUN chown -R neura:neura /app

WORKDIR /workspace

EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# SECURITY: Run as non-root user
USER neura

CMD ["node", "/app/sandbox-server.js"]