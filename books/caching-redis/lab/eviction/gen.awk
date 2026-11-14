# Sinh luồng lệnh RESP cho kịch bản eviction. Dùng: awk -v ex=ex -f gen.awk > all.resp
function c1(a){ printf "$%d\r\n%s\r\n", length(a), a }
function setk(k){ if (ex == "ex") { printf "*5\r\n"; c1("SET"); c1(k); c1(v); c1("EX"); c1("3600") }
                  else { printf "*3\r\n"; c1("SET"); c1(k); c1(v) } }
BEGIN {
  v = sprintf("%1000s", ""); gsub(/ /, "x", v)
  for (i = 1; i <= 6000; i++) setk("k:" i)
  for (r = 0; r < 9; r++) {
    for (j = 1; j <= 1000; j++) setk("k:" (6000 + r * 1000 + j))
    for (t = 0; t < 2; t++) for (h = 1; h <= 1000; h++) { printf "*2\r\n"; c1("GET"); c1("k:" h) }
  }
}
