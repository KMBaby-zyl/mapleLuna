-- ===== 配置 =====
local TURN_INTERVAL = 3      -- 切换左右朝向间隔（秒）
local TURN_PAUSE = 1ii       -- 换方向前停止输出的时间（秒）
local BUFF_INTERVAL = 300    -- buff 触发周期（秒）
local BUFF_KEY_GAP = 1.5     -- buff 按键之间的间隔（秒）

local ATTACK_KEY = "q"          -- 攻击键
local TURN_KEYS = { "left", "right" }
local BUFF_KEYS = { "3", "4" }

-- ===== 状态 =====
local running = false    -- 总开关：站桩输出 + buff 是否在运行
local attacking = false  -- 站桩输出是否在运行
local turnTimer = nil
local buffTimer = nil
local index = 1 -- 当前朝向在 TURN_KEYS 中的下标

-- ===== 按键辅助 =====
local function pressKey(key)
    hs.eventtap.event.newKeyEvent({}, key, true):post()
end

local function releaseKey(key)
    hs.eventtap.event.newKeyEvent({}, key, false):post()
end

local function clickKey(key)
    pressKey(key)
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

-- 先停止输出 TURN_PAUSE 秒，再轻点朝向键切换面向（不移动），随后恢复输出
local function turnCurrent()
    stopAttackLoop()
    hs.timer.doAfter(TURN_PAUSE, function()
        if not attacking then return end
        clickKey(TURN_KEYS[index])
        index = index % #TURN_KEYS + 1
        startAttackLoop()
    end)
end

local function startAttack()
    if attacking then return end
    print("stand-attack started")
    attacking = true
    index = 1

    turnCurrent()
    turnTimer = hs.timer.doEvery(TURN_INTERVAL, turnCurrent)
    startAttackLoop()
end

local function stopAttack()
    print("stand-attack end")
    attacking = false

    if turnTimer then turnTimer:stop(); turnTimer = nil end
    stopAttackLoop()

    releaseTurnKeys()
end

-- ===== Buff =====
-- 依次点击 BUFF_KEYS，全部完成后回到站桩输出
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

hs.hotkey.bind({},"-", function()
    if running then stop() else start() end
end)

-- 防止崩溃残留按键（兜底）
hs.shutdownCallback = function()
    releaseTurnKeys()
    releaseKey(ATTACK_KEY)
end
