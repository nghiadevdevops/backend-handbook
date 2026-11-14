#!lua name=ratelimit
-- Thư viện Valkey/Redis Functions (Redis >= 7.0, Valkey >= 7.2). Nạp: FUNCTION LOAD REPLACE "<nội dung file>"
-- Gọi: FCALL token_bucket 1 rl:tb:user7 <capacity> <refill_per_sec> [cost]

local function token_bucket(keys, args)
  local key      = keys[1]
  local capacity = tonumber(args[1])
  local rate     = tonumber(args[2])
  local cost     = tonumber(args[3] or 1)
  local t   = redis.call('TIME')
  local now = tonumber(t[1]) + tonumber(t[2]) / 1000000
  local d      = redis.call('HMGET', key, 'tokens', 'ts')
  local tokens = tonumber(d[1])
  local ts     = tonumber(d[2])
  if tokens == nil then tokens = capacity; ts = now end
  tokens = math.min(capacity, tokens + (now - ts) * rate)
  local allowed = 0
  if tokens >= cost then tokens = tokens - cost; allowed = 1 end
  redis.call('HSET', key, 'tokens', tostring(tokens), 'ts', tostring(now))
  redis.call('PEXPIRE', key, math.ceil(capacity / rate * 1000) + 1000)
  return { allowed, tostring(tokens) }
end

-- Sliding window log: tối đa `limit` yêu cầu trong `window_ms`. member phải duy nhất mỗi yêu cầu.
-- Gọi: FCALL sliding_window 1 rl:sw:user7 <limit> <window_ms> <member>
local function sliding_window(keys, args)
  local key       = keys[1]
  local limit     = tonumber(args[1])
  local window_ms = tonumber(args[2])
  local member    = args[3]
  local t   = redis.call('TIME')
  local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
  redis.call('ZREMRANGEBYSCORE', key, 0, now - window_ms)
  if redis.call('ZCARD', key) < limit then
    redis.call('ZADD', key, now, member)
    redis.call('PEXPIRE', key, window_ms)
    return 1
  end
  return 0
end

-- Fixed window: INCR + hết hạn khi tạo. Gọi: FCALL fixed_window 1 rl:fw:user7 <limit> <window_sec>
local function fixed_window(keys, args)
  local n = redis.call('INCR', keys[1])
  if n == 1 then redis.call('EXPIRE', keys[1], tonumber(args[2])) end
  if n <= tonumber(args[1]) then return 1 end
  return 0
end

redis.register_function('token_bucket', token_bucket)
redis.register_function('sliding_window', sliding_window)
redis.register_function('fixed_window', fixed_window)
