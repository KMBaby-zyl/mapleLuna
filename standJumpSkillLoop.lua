-- ===== 配置 =====
local ATTACK_INTERVAL = 3.2       -- 每隔多少秒点一次技能
local ATTACKS_PER_TURN = 5        -- 点多少次技能后切换方向

local ATTACK_KEY = "r"            -- 技能键
local JUMP_KEY = "space"          -- 跳跃键
local JUMP_ATTACK_DELAY = 0.2     -- 跳起后等多久再攻击（秒）
local TURN_KEYS = { "left", "right" }
local KEY_HOLD = 0.03             -- 点按时按住的时长（秒）；太短游戏会采样不到导致丢键
local TURN_TAP_HOLD = 0.03        -- 原地切换方向时方向键点按时长

-- ===== 状态 =====
local running = false
local attackTimer = nil
local attackCount = 0
local turnIndex = 1 -- 当前朝向在 TURN_KEYS 中的下标

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

-- ===== 原地释放技能 =====
local function turnCurrent()
    local key = TURN_KEYS[turnIndex]
    print("turn " .. key)
    clickKey(key, TURN_TAP_HOLD)
    turnIndex = turnIndex % #TURN_KEYS + 1
end

local function jumpAttack()
    clickKey(JUMP_KEY)
    hs.timer.usleep(math.floor(JUMP_ATTACK_DELAY * 1000000))
    clickKey(ATTACK_KEY)
end

local function clickAttack()
    if not running then return end

    jumpAttack()
    attackCount = attackCount + 1

    if attackCount >= ATTACKS_PER_TURN then
        attackCount = 0
        turnCurrent()
    end
end

-- ===== 启动 / 停止 =====
local function start()
    if running then return end

    print("stand-jump-skill-loop started")
    running = true
    attackCount = 0
    turnIndex = 1

    clickAttack()
    attackTimer = hs.timer.doEvery(ATTACK_INTERVAL, clickAttack)
end

local function stop()
    print("stand-jump-skill-loop end")
    running = false
    if attackTimer then attackTimer:stop(); attackTimer = nil end

    releaseKey(ATTACK_KEY)
    releaseKey(JUMP_KEY)
    releaseTurnKeys()
end

hs.hotkey.bind({},"-", function()
    if running then stop() else start() end
end)

-- 防止崩溃残留按键（兜底）
hs.shutdownCallback = function()
    releaseTurnKeys()
    releaseKey(ATTACK_KEY)
    releaseKey(JUMP_KEY)
end
