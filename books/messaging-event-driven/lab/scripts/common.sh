export MSYS_NO_PATHCONV=1   # Git Bash trên Windows: không đổi /opt/... thành đường dẫn Windows
# Biến và hàm dùng chung. Chỉ cần docker + shell trên host.
KAFKA=bookcheck-msg-kafka
PG=bookcheck-msg-pg
BS=localhost:9092
K=/opt/kafka/bin
psqlx() { local db=$1; shift; timeout 60 docker exec -i "$PG" psql -U postgres -d "$db" -v ON_ERROR_STOP=1 -q "$@"; }
