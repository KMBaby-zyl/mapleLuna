-- ===== 配置 =====
local WALK_DURATION = 10  -- 每个方向行走时长（秒）
local ATTACK_INTERVAL = 0.4 -- 攻击间隔（秒）
local BUFF_INTERVAL = 300   -- buff 触发周期（秒）
local BUFF_KEY_GAP = 1.5    -- buff 按键之间的间隔（秒）

local ATTACK_KEY = "q"          -- 攻击键
local MOVE_KEYS = { "left", "right" }
local BUFF_KEYS = { "3", "4" }
local KEY_HOLD = 0.03           -- 点按时按住的时长（秒）；太短游戏会采样不到导致丢键

-- ===== 状态 =====
local running = false    -- 总开关：行走攻击 + buff 是否在运行
local attacking = false  -- 行走 + 攻击是否在运行
local moveTimer = nil
local attackTimer = nil
local buffTimer = nil
local index = 1 -- 当前移动方向在 MOVE_KEYS 中的下标

-- ===== 按键辅助 =====
local function pressKey(key)
    hs.eventtap.event.newKeyEvent({}, key, true):post()
end

local function releaseKey(key)
    hs.eventtap.event.newKeyEvent({}, key, false):post()
end

local function clickKey(key)
    pressKey(key)
    hs.timer.usleep(math.floor(KEY_HOLD * 1000000))
    releaseKey(key)
end

local function releaseMoveKeys()
    for _, key in ipairs(MOVE_KEYS) do
        releaseKey(key)
    end
end

-- ===== 行走 + 攻击 =====
-- 切换到当前 index 指向的方向，松开其它方向键
local function walkCurrent()
    releaseMoveKeys()
    pressKey(MOVE_KEYS[index])
    index = index % #MOVE_KEYS + 1 -- 下次切到另一个方向
end

local function startAttack()
    if attacking then return end
    print("walk-attack started")
    attacking = true
    index = 1

    walkCurrent()
    moveTimer = hs.timer.doEvery(WALK_DURATION, walkCurrent)

    attackTimer = hs.timer.doEvery(ATTACK_INTERVAL, function()
        clickKey(ATTACK_KEY)
    end)
end

local function stopAttack()
    print("walk-attack end")
    attacking = false

    if moveTimer then moveTimer:stop(); moveTimer = nil end
    if attackTimer then attackTimer:stop(); attackTimer = nil end

    releaseMoveKeys()
    releaseKey(ATTACK_KEY)
end

-- ===== Buff =====
-- 依次点击 BUFF_KEYS，全部完成后回到行走攻击
local function startBuff()
    print("buff started")
    stopAttack()

    local function clickAt(i)
        if i > #BUFF_KEYS then
            print("buff end")
            if running then startAttack() end
            return
        end
        clickKey(BUFF_KEYS[i])
        hs.timer.doAfter(BUFF_KEY_GAP, function() clickAt(i + 1) end)
    end

    clickAt(1)
end

-- ===== 启动 / 停止 =====
local function start()
    running = true
    startBuff()
    buffTimer = hs.timer.doEvery(BUFF_INTERVAL, function()
        if running then startBuff() end
    end)
end

local function stop()
    running = false
    if buffTimer then buffTimer:stop(); buffTimer = nil end
    stopAttack()
end

hs.hotkey.bind({}, "-", function()
    if running then stop() else start() end
end)

-- 防止崩溃残留按键（兜底）
hs.shutdownCallback = function()
    releaseMoveKeys()
    releaseKey(ATTACK_KEY)
end
