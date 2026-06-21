local toggle = false
local timer = nil

function pressQ()
    hs.eventtap.event.newKeyEvent({}, "q", true):post()
end

function releaseQ()
    hs.eventtap.event.newKeyEvent({}, "q", false):post()
end

function pressRight()
    hs.eventtap.event.newKeyEvent({}, "right", true):post()
end

function releaseRight()
    hs.eventtap.event.newKeyEvent({}, "right", false):post()
end

function pressLeft()
    hs.eventtap.event.newKeyEvent({}, "left", true):post()
end

function releaseLeft()
    hs.eventtap.event.newKeyEvent({}, "left", false):post()
end

function startMacro()
    print("macro started")
    if toggle then return end
    toggle = true

    pressQ()

    local state = 0 -- 0:right 1:left

    timer = hs.timer.doEvery(2, function()
        if not toggle then return end

        if state == 0 then
            print(state)
            releaseLeft()
            pressRight()
            state = 1
        else
            print(state)
            releaseRight()
            pressLeft()
            state = 0
        end
    end)
end

function stopMacro()
    print("macro end")
    toggle = false

    if timer then
        timer:stop()
        timer = nil
    end
   
    releaseQ()
    releaseRight()
    releaseLeft()
end

hs.hotkey.bind({}, "-", function()
    if toggle then
        stopMacro()
    else
        startMacro()
    end
end)

-- 防止崩溃残留Q（兜底）
hs.shutdownCallback = function()
    releaseQ()
    releaseRight()
    releaseLeft()
end
