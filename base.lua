-- ===== 配置 =====
local MOVE_INTERVAL = 2     -- 左右移动切换间隔（秒）
local BUFF_INTERVAL = 300   -- buff 触发周期（秒）
local BUFF_KEY_GAP = 1.5    -- buff 按键之间的间隔（秒）

local HOLD_KEY = "q"            -- 需要长按的键
local MOVE_KEYS = { "left", "right" }
local BUFF_KEYS = { "3", "4" }

-- ===== 状态 =====
local running = false   -- 总开关：宏 + buff 是否在运行
local moving = false    -- 移动宏是否在运行
local moveTimer = nil
local buffTimer = nil

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

local function releaseAllKeys()
    releaseKey(HOLD_KEY)
    for _, key in ipairs(MOVE_KEYS) do
        releaseKey(key)
    end
end

-- ===== 移动宏 =====
local function startMacro()
    if moving then return end
    print("macro started")
    moving = true

    pressKey(HOLD_KEY)

    local index = 1 -- 当前移动方向在 MOVE_KEYS 中的下标
    moveTimer = hs.timer.doEvery(MOVE_INTERVAL, function()
        if not moving then return end

        for i, key in ipairs(MOVE_KEYS) do
            if i ~= index then releaseKey(key) end
        end
        pressKey(MOVE_KEYS[index])

        index = index % #MOVE_KEYS + 1 -- 切换到下一个方向
    end)
end

local function stopMacro()
    print("macro end")
    moving = false

    if moveTimer then
        moveTimer:stop()
        moveTimer = nil
    end

    releaseAllKeys()
end

-- ===== Buff =====
-- 依次点击 BUFF_KEYS，全部完成后回到移动宏
local function startBuff()
    print("buff started")
    stopMacro()

    local function clickAt(i)
        if i > #BUFF_KEYS then
            print("buff end")
            if running then startMacro() end
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
    -- startMacro()
    startBuff()
    buffTimer = hs.timer.doEvery(BUFF_INTERVAL, function()
        if running then startBuff() end
    end)
end

local function stop()
    running = false
    if buffTimer then
        buffTimer:stop()
        buffTimer = nil
    end
    stopMacro()
end

hs.hotkey.bind({}, "-", function()
    if running then stop() else start() end
end)

-- 防止崩溃残留按键（兜底）
hs.shutdownCallback = function()
    releaseAllKeys()
end
