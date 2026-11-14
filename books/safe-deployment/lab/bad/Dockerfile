FROM golang:latest
RUN apt-get update && apt-get install -y curl git
COPY . /src
RUN cd /src && go build -o /app .
