-- ===== 配置 =====
local TURN_INTERVAL = 3      -- 切换左右朝向间隔（秒）
local TURN_PAUSE = 1         -- 换方向前停止输出的时间（秒）

local ATTACK_KEY = "q"          -- 攻击键
local ATTACK_DIRECTION_MODE = "single" -- "single" 只攻击一个方向；"alternate" 左右轮流
local SINGLE_ATTACK_DIRECTION = "left"    -- ATTACK_DIRECTION_MODE = "single" 时使用的方向
local TURN_KEYS = { "left", "right" }
local KEY_HOLD = 0.03           -- 点按时按住的时长（秒）；太短游戏会采样不到导致丢键
local TURN_TAP_HOLD = 1      -- 左右切换朝向时点按方向键的时长（秒）；调大可让人物移动一小段

-- ===== 状态 =====
local running = false    -- 总开关：站桩输出是否在运行
local attacking = false  -- 站桩输出是否在运行
local turnTimer = nil
local index = 1 -- 当前朝向在 TURN_KEYS 中的下标

-- ===== 按键辅助 =====
local function pressKey(key)
    hs.eventtap.event.newKeyEvent({}, key, true):post()
end

local function releaseKey(key)
    hs.eventtap.event.newKeyEvent({}, key, false):post()
end

local function clickKey(key, hold)
    hold = hold or KEY_HOLD
    pressKey(key)
    hs.timer.usleep(math.floor(hold * 1000000))
    releaseKey(key)
end

local function releaseTurnKeys()
    for _, key in ipairs(TURN_KEYS) do
        releaseKey(key)
    end
end

-- ===== 站桩输出 =====
-- 按住攻击键持续输出
local function startAttackLoop()
    pressKey(ATTACK_KEY)
end

local function stopAttackLoop()
    releaseKey(ATTACK_KEY)
end

local function isAlternateMode()
    return ATTACK_DIRECTION_MODE == "alternate"
end

-- 先停止输出 TURN_PAUSE 秒，再轻点朝向键切换面向（不移动），随后恢复输出
local function turnCurrent()
    stopAttackLoop()
    hs.timer.doAfter(TURN_PAUSE, function()
        if not attacking then return end
        local key = SINGLE_ATTACK_DIRECTION
        if isAlternateMode() then
            key = TURN_KEYS[index]
            index = index % #TURN_KEYS + 1
        end
        clickKey(key, TURN_TAP_HOLD)
        startAttackLoop()
    end)
end

local function startAttack()
    if attacking then return end
    print("stand-attack started")
    attacking = true
    index = 1

    turnCurrent()
    if isAlternateMode() then
        turnTimer = hs.timer.doEvery(TURN_INTERVAL, turnCurrent)
    end
    startAttackLoop()
end

local function stopAttack()
    print("stand-attack end")
    attacking = false

    if turnTimer then turnTimer:stop(); turnTimer = nil end
    stopAttackLoop()

    releaseTurnKeys()
end

-- ===== 启动 / 停止 =====
local function start()
    running = true
    startAttack()
end

local function stop()
    running = false
    stopAttack()
end

hs.hotkey.bind({},"-", function()
    if running then stop() else start() end
end)

-- 防止崩溃残留按键（兜底）
hs.shutdownCallback = function()
    releaseTurnKeys()
    releaseKey(ATTACK_KEY)
end
