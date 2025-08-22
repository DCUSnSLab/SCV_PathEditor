# Stage 1: Build stage - Install dependencies
FROM python:3.10-slim as builder

WORKDIR /app

# Copy only the requirements file to leverage Docker cache
COPY backend/requirements.txt .

# Install dependencies to a user-specific directory
RUN pip install --no-cache-dir --user -r requirements.txt

# Stage 2: Final stage - Create the production image
FROM python:3.10-slim

WORKDIR /app

# Copy installed dependencies from the builder stage
COPY --from=builder /root/.local /root/.local

# Copy application code
# Copy backend and frontend into the container
COPY backend/ ./backend/
COPY frontend/ ./frontend/

# Add the local python user's bin directory to the PATH
ENV PATH=/root/.local/bin:$PATH

# Expose the port the app runs on
EXPOSE 8000

# Set the working directory for the command
WORKDIR /app/backend

# Command to run the application
# Uvicorn is used to run the FastAPI application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
