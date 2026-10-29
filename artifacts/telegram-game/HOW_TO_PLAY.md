# How to Play Among Gas

Among Gas keeps its own balaclava characters and custom gas-station map. The rules are inspired by the social-deduction format of Among Us, but task locations and some actions are specific to this map.

![Among Gas gameplay on a phone](screenshots/gameplay-small-portrait.webp)

## The goal

- **Crewmate:** finish your assigned tasks together, or identify and vote out the impostor.
- **Impostor:** blend in, sabotage the crew, and eliminate crewmates without being caught.
- **Both sides:** pay attention to where people were seen and what they say during meetings.

## Moving around

- On a phone, press and drag the virtual joystick in the direction you want to walk.
- On a keyboard, use **W A S D** or the **arrow keys**.
- Your character's legs animate while moving. The shadow beneath a living character stays on the ground; ghosts float without a ground shadow.
- Walk up to an available task or interaction and use the action button when it appears.

## If you are a crewmate

1. Open your task list to see what you have been assigned.
2. Walk to a task marker and use the nearby action button.
3. Complete each step in the task panel. Your team's progress increases as tasks are completed.
4. If you find a body, report it. You can also call an emergency meeting when available.
5. During the discussion, read the chat and share useful information. When voting opens, select a player or skip.
6. If you are eliminated, you can still move as a ghost and finish eligible tasks, but you cannot report bodies or vote as a living player.

## If you are the impostor

1. Act like you are doing tasks and avoid drawing attention.
2. The **Kill** action is only available in range and after its cooldown; the server validates each attempt.
3. Use vents where the vent action is available to travel between connected vents.
4. Sabotage can disrupt the crew. Watch the on-screen repair prompts and cooldowns.
5. During meetings, explain your movements and vote strategically.

## Map and controls

![Among Gas desktop gameplay](screenshots/gameplay-desktop.webp)

- Use **Map** to open or close the map overlay. Close it to return to movement.
- Use **Tasks** to show or hide your task list.
- Use **Settings** to change language, choose the joystick side, or arrange gameplay controls.
- To arrange controls on a touch device, drag each control in the preview area, keep it below the fixed top HUD, then choose **Save positions**. Use **Reset** to return to the defaults.
- Settings are saved on the device when browser storage is available.

![Settings and drag-to-place control editor](screenshots/settings-default.webp)

## Meetings and chat

When a body is reported or an emergency meeting is called, normal movement and gameplay actions pause for the meeting. First comes **Discussion**, when players can chat; then **Voting**, when votes are accepted. Use the countdown to see which phase is active. The meeting closes when its server-controlled timer and vote flow finish.

Bots post short discussion messages based on the meeting type and their assigned role, and cast votes only when voting opens. They do not have a history of witnessed player movements, so they avoid making location-based accusations. Their statements are simple local heuristics, not a connected large language model, so treat them as conversation starters rather than proof.

## Quick troubleshooting

- **Map still loading:** wait until the map and character artwork have finished loading; the server holds gameplay and bot actions until connected human clients report ready.
- **A task button is missing:** move closer to the task and check that you are alive as a crewmate and that no active sabotage is blocking it.
- **A button is in the wrong place:** open Settings, drag it in the control preview, and save. Reset restores default positions.
- **The joystick feels awkward:** use Settings to switch sides, or reposition it in the drag editor.

