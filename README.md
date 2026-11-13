# Everway — Graphics Edition

An endless scenic driving experience with a convertible car, motorcycle and bicycle, a visible driver/rider, moving traffic, five landscapes, weather, and day/night controls.

## Start on Windows

1. Extract the entire ZIP to a folder.
2. With Python 3 installed, double-click START_WINDOWS.bat.
3. Your browser opens the game automatically. Click Let's wander.
4. Keep the terminal window open while playing. Ctrl+C stops the server.

## macOS / Linux / terminal

Run `python3 server.py` from the extracted folder. On Windows, `py -3 server.py` also works.

Alternatively, serve the `dist` folder using your preferred static HTTP server, such as VS Code Live Server. Do not open index.html directly with file:// because browser ES modules require an HTTP server.

No npm installation, API key, account, paid API, or build step is required. Three.js is bundled. Google Fonts are optional; system fonts work offline.

## Detailed cars and buildings (v3.1)

- Your roadster has a sculpted body with real wheel arches, chrome bumpers and trim, round headlamps, wire wheels, a leather cockpit with dashboard, gauges and steering wheel, and a curved windscreen.
- Traffic is now sedans, hatchbacks and SUVs with glass cabins, roof pillars, alloy wheels, brake callipers and proper light clusters.
- Buildings: cottages, farmhouses with porches, town shops (brick, display windows, striped awnings, signs, cornices), townhouses with shutters, mountain log cabins and red barns with gambrel roofs, cupolas and silos. They have shingled roofs, framed windows, chimneys, picket fences, mailboxes and garden shrubs, and windows light up at night.

## Realistic scenery (v3)

Double-click GET_ASSETS.bat once (needs internet and Python 3). It downloads free CC0 photo-scanned ground and asphalt textures, plus tree, pine, rock and shrub models, from Poly Haven into dist/assets (roughly 50-150 MB). Then start the game as usual: Settings shows REALISTIC SCENERY when they are in use. Delete dist/assets to go back to the generated look.

Also new in v3, with or without the download:
- Ground made from blended PBR layers (grass, rock, sand, snow) with normal maps, chosen by slope, height and region.
- Dense instanced grass that moves in the wind.
- Screen-space ambient occlusion (soft contact shadows) and 4K shadow maps on High.
- Real trees and rocks near the road, with the light low-poly versions used in the distance.

## Graphics overhaul (v2)

- New rendering core: static scenery is merged per road section, cutting ~5,200 draw calls per frame to a few hundred. That headroom pays for everything below.
- HDR pipeline with bloom, ACES tone mapping, 4× MSAA, colour grading per time of day and a soft vignette.
- Procedural sky shader: sun disk and halo, sunset glow on the horizon, twinkling stars and a moon at night. The sky is re-baked into a reflection map, so paint, chrome and wet roads mirror it.
- Exponential fog matched to the horizon, plus layered, lit and hazed mountain ranges that take on each region's colours (red rock in the desert, snow caps in the Alps).
- Soft billboard clouds; coverage follows the weather.
- Shaded, continuous terrain with hills, desert mesas, rock on steep slopes, snow lines and farm patchwork. Regions blend into each other instead of switching at a hard seam.
- Detailed road texture (gravel shoulders, tyre polish, cracks, patches), bump detail and real wet-road reflections in rain.
- Varied low-poly trees (oaks, poplars, snow-laden pines) that sway in the wind, grass tufts, wildflowers, bushes, cacti, rocks and hay bales.
- Houses facing the road with gable roofs, chimneys, framed windows that light up at night, shop awnings, red barns with silos, street lamps with light pools, power lines with sagging wires, and Route 66 billboards.
- Night: glowing head/tail lights on every car, moonlight, lit windows and lamps.
- Rain streaks and soft snowflakes.
- Graphics setting (Auto / High / Balanced / Fast). Auto steps down if the frame rate drops.
- Machines without WebGL 2 still get the original compatibility renderer (dist/legacy.js).

## Earlier upgrades

- Curved roadster body with paint clearcoat, alloy wheel spokes, grille, lights, tan seats and an open cabin.
- Improved motorcycle/bicycle and rider models; persistent leg joints for pedalling.
- Textured asphalt, reflective paint environment, gradient sky and 2048px shadow maps in WebGL.
- Clustered foliage, gentle wind sway, terrain hills, layered mountain ridges and roadside rocks.
- Damped steering, body lean, close chase camera and speed-sensitive field of view.
- Wet-road patches, rain screen effects, snow and atmospheric night lighting.
- Improved compatibility renderer with near-plane clipping and shaded foliage.

## Controls

- Settings button (top right): ride, scenery, weather, time, cruise speed, driving mode.
- W / Up: accelerate in manual mode. S / Down: brake. A D / Left Right: steer.
- Drag with the mouse (or the right stick): look around while driving.
- C: switch camera. P: photo mode. R: replay the last two minutes. H: hide the display. Space: pause.
- At a fork: Left / Right while autodrive steers, or Q / E when you drive.
- L: full beam / dipped headlights (autodrive dips them by itself). F: flash your headlights.
- Steering wheels and pedals work; Settings > Driving > Swap the pedals if they come out the wrong way round.
- Phones: drag the round steering pad, hold Go and Brake.

## Version 3.23: cars that look like real cars

- Modern proportions: a higher shoulder and window line, bigger wheels that fill the arches, flatter ends.
- Alloy wheels with twin spokes, wheel nuts and a dark barrel; grey brake callipers (red on the sporty cars); black wheel wells.
- Headlamp clusters under clear covers (projectors and an LED running-light strip), tail-lamp clusters with reversing lamps, a light bar on the electric car.
- A grille with slats, a lower air intake and rear diffuser, black sills (and arch cladding on the SUV), door handles, side indicators, wipers, a shark-fin aerial and a gloss-black B pillar.
- Tail lamps are no longer lit up in daylight.

## Version 3.19: a better picture
- Sky: sunrise and sunset glow on the sun's side, a pink band over the blue shadow of the earth at dusk, and a high layer of thin cloud that drifts with the wind and catches the sunset.
- Wet roads: headlights and tail-lights stretch into long reflections on wet tarmac; raindrops make rings in the puddles.
- Rain on the glass: drops bead on the windscreen in the driver's view and the wipers clear them; in the chase and side views a few drops sit on the lens.
- Your car reflects the world around it: sky, trees and road slide across the paint and glass.
- Trees bend in passing gusts; grass parts as the car brushes the verge.
- Bare rock on steep slopes, finer ground detail close up, and woods that carry on to the horizon.
- Speed blur at high speed, depth of field in the cinematic and photo cameras.
- Look (Settings, Sky): Natural, Warm film, Cool or Black & white, with lens flare, speed blur, film grain and cinema bars as switches.
- Smoother running: the picture resolution adjusts itself to hold the frame rate before the quality level steps down; smoother edges on Balanced.

## Version 3.18: the garage
Eleven cars to choose from (Settings, Trip, Ride: Car), each with its own body, engine note and feel on the road. The names are our own; each is modelled on a kind of car you can buy today, with performance in the range of the real thing.

| Car | Kind | Top speed | Character |
|---|---|---|---|
| Meridian | Touring coupé | 238 km/h | Balanced and easy |
| Kestrel R | Hot hatch | 241 km/h | Eager, darty steering |
| Linden | Family saloon | 209 km/h | Soft and quiet |
| Solace | Electric saloon | 248 km/h | Silent, instant pick-up, one gear |
| Ridgeback | SUV | 209 km/h | Tall and soft, keeps its grip on rough ground |
| Halcyon | Classic roadster | 187 km/h | Wire wheels, gentle and old-fashioned |
| Ironside V8 | Muscle car | 284 km/h | Big V8, loose tail |
| Brisa GT | Grand tourer | 317 km/h | Long-legged V12, refined |
| Dustrunner | Rally hatch | 227 km/h | All-wheel drive, quick steering, best on gravel and snow |
| Vanta | Supercar | 328 km/h | Mid-engined V10, razor sharp |
| Seraph | Hypercar | 349 km/h | Huge grip, tall wing, V12 howl |

- Each car has its own acceleration, braking, top speed, tyre grip, steering speed, body roll, suspension softness and gearbox, and its own engine sound (cylinders, rev range, tone). The electric car hums instead.
- Choose a paint colour for any car. Your car and colour are kept with your journey.
- The cruising speed for autodrive now goes up to 200 km/h.

## Version 3.17: rare moments, and safer overtaking
Small surprises that reward a long drive. Each happens only now and then, when the time, place, season and weather suit it, with a few minutes of ordinary road between any two. A quiet word says where to look.
- A rainbow opposite the sun when the rain stops (with a faint second bow), while the sun is low enough to lift it above the hills.
- Mist lying in the hollows below the road on calm mornings, warming as the sun comes up.
- Fireflies in the verges on summer nights.
- Shooting stars on a clear night.
- The northern lights over the snow: green curtains with violet tops, rippling slowly.
- Starlings flocking at dusk in autumn, winter and spring: one flowing, folding cloud of birds.
- Horses grazing in a field, wandering a few steps now and then.
- A hot-air balloon drifting over the countryside on calm mornings and evenings, its burner glowing.
- See all eight for the "Small wonders" achievement in the journal.

Driving
- Autodrive overtakes slow vehicles, but only on a straight, open stretch, and only when the nearest oncoming vehicle is far enough away to still be clear once it is back in its lane. It keeps checking and drops back if something appears. Oncoming drivers slow down and keep to the verge if anyone is in their lane.
- Cameras no longer go inside hillsides (which made walls and grass look as if they floated in the sky); the side camera keeps clear of houses in villages and towns.

## Version 3.16: life on the road, and headlights

- Now and then (every few kilometres at most) something happens on the road: sheep wander across in the countryside, roadworks close your lane with cones and a temporary traffic light, a tractor ahead slows, signals and turns off into a field, and at dusk deer cross in the hills. Autodrive and the traffic slow down and wait; driving yourself, you deal with them (driving into an animal is a knock, and running a red light gets a word).
- Headlights: L switches between dipped and full beam at night. Autodrive uses full beam on empty roads and dips for oncoming traffic and for a car ahead. Driving yourself, an oncoming driver flashes you if you leave full beam on.
- F flashes your headlights. When a slow tractor pulls in to let you by, a flash says thanks (and the driver raises a hand).
- Fixed: on twisty roads in the snow the road could sink to sea level, which autodrive took for driving into the sea. The road now always stays above the sea, and the sea only counts once you leave the road.

## Version 3.15: real roads, a livelier world, better driving

Roads
- Forks are real: choose the other way and your road bends off that way and carries on as a road of its own, while the road you did not take curves away where it really goes. Your turns are saved with the journey and journey codes.
- Side roads (switched off in v3.22; set SIDE_ROADS in trip.js to bring them back): between forks, a brown sign points down a lane to a beach on the coast, a farm in the countryside, or a viewpoint in the hills, and you can see the lane leaving the road. Choose "Turn off" on the card (or press T) and the road takes you there, about half a kilometre down to a turning circle. A beach slopes down to the sea, a farm has its house, barn and animals, and a viewpoint looks out over a drop. You get a postcard when you arrive. "Back to the main road" (or T) returns you to where you turned off.
- Villages have two side streets each, and towns one every 240 m, with houses facing the street and street lamps.

Driving
- The car sits on springs: it squats when you accelerate, dips its nose when you brake, leans in bends, bounces over rough ground and compresses when it lands.
- Grip depends on the surface: tarmac, loose gravel on the shoulder, grass off the road, and now and then a patch of ice in winter (with a word of warning).
- Braking before a bend helps the car turn in; hard acceleration makes it run wide.
- Knocks use the car's real outline, turned to the way it is pointing.
- Steering wheels and pedals work (the wheel has no dead zone; Settings > Driving > Swap the pedals if they come out the wrong way round). Controllers that can rumble do so on knocks.
- On phones, drag the round steering pad left or right (further is more steering) and hold the Go and Brake pedals.

Traffic and life
- Cars overtake slow tractors and cyclists when the other lane is clear on a straight, signalling out and back in.
- Some cars pull in to stop in villages for a while, with hazard lights, then signal and pull out again.
- At a fork, some traffic takes the other road.
- Cyclists ride at the edge of the road in the countryside.
- People walk along the verges in villages and towns.

Looks
- Rivers run along some valleys beside the road, flowing gently downhill, with reflecting, rippling water.
- Cloud shadows drift across the land when the sky is broken cloud.
- Broadleaf trees have full rounded crowns; poplars are tapering columns.
- Your own model kits: put free CC0 kits (for example Kenney's "Car Kit" and "City Kit (Suburban)" from kenney.nl) unzipped into dist/assets/packs/ and run GET_ASSETS.bat. Vehicles in them are used for traffic cars, buildings for houses (facing the road). This works alongside the Poly Haven trees, rocks and ground textures.

## Version 3.14: forks, replays, postcards and a calmer screen

- Forks in the road: about every 4 km (when no bridge or tunnel is in the way) the road splits. A card names the place each way leads (for example "← Little Town · Wild Coast →") about 1.5 km before; choose with the card, ← / → while autodrive steers, or Q / E when you drive yourself. A green sign stands by the road before the fork, the other road curves away into the land, and the places after the fork follow your choice. Without a choice you stay on the planned route. Choices are saved with your journey.
- A clean screen while driving (Settings > Driving > Display while driving): after a few quiet seconds only the speed sign and the compass or map stay; the place sign comes back for a few seconds when you enter a new place, and the damage bar stays if you have a dent. Move the mouse or press a key to see everything again. Choose "Everything" to keep the full display.
- Look around while driving: drag with the mouse (or a finger), or use the right stick, to swing the camera around the vehicle or turn your head in the driver's view. It eases back a moment after you let go.
- Cinematic camera: now a sequence of shots cut together like a film: a roadside camera that pans and zooms to keep the car framed, a camera travelling alongside, a low camera ahead looking back, a high camera slowly circling (a drone shot), and a low roadside fly-by. If a hill would hide the car, it cuts to another shot.
- Postcards: passing a landmark gives you a postcard with a picture of the moment (the lighthouse, the castle, the windmill, the waterfall, the two viewpoints and the desert arch). They are kept in the journal; collect them all for a new achievement.
- Your vehicle: indicators blink towards the road you take at a fork and when you change lane yourself, hazard lights flash for a few seconds after a knock, and in the rain wipers sweep the windscreen in the driver's view. Dust rises behind you off the road in dry weather, spray on wet roads, and snow is kicked up in winter.
- Replays: the last two minutes are always kept. Press R (or the Replay button) to watch them from any camera (cinematic to start with), pause, scrub along the bar, play at half speed, then go back to driving where you left off.

## Version 3.13: sound, light and a lived-in world

Sound
- A new engine sound in three layers (a low rumble, the body of the engine and a rasp near the top of the revs) that blend as the revs rise and open up when you accelerate. Gear changes dip the sound for a moment; lifting off softens it and can bring a few pops from the exhaust. Each ride sounds different (the coach has a diesel clatter, the motorbike revs high, the bicycle ticks when you freewheel).
- The road: tyre roar that grows with speed, gravel crunching on the shoulder, grass and bumps off the road, the hiss of a wet road, a double thump over bridge joints, and a hard echo inside tunnels.
- Passing things: a whoosh, panned to the side, as you pass trees, posts, houses and signs, and the rush of air off a wall or barrier beside you.
- Sound around you: birds left and right (a dawn chorus in the morning), crickets and the odd owl at night, surf from the side the sea is on, gulls on the coast, a stream under bridges, wind gusts moving from side to side, and rain on the roof.
- Other vehicles: each nearby car, van or tractor has its own engine and tyre sound, louder as it comes closer and panned to its side of the road, rising in pitch as it approaches and dropping as it passes (the Doppler effect).
- Waterfalls roar from their side of the road as you pass, and church bells ring a short peal as you drive into a village in the daytime.
- At night the rain catches less light, so it no longer looks too bright.
- Music (Settings > Driving > Music, formerly Calm radio): calm generated tracks whose key, chords, pace and instruments follow the time of day (dawn, day, dusk, night) and the place (desert, mountains, another world), fading from one to the next.

Light and atmosphere
- Shadows reach further ahead of the car on better graphics, and the soft contact shading under objects now reaches further into the distance.
- Weather changes in stages: before rain the clouds gather and the light dims, and only then does it start, building up gradually; afterwards the rain stops first and the clouds clear later.
- At night on a wet road, street lamps are reflected as long wavering streaks.
- Lakes under bridges show real reflections of the bridge, trees and sky, bent by their ripples.

A world that feels lived in
- Smoke rises from many chimneys (more on cold mornings and evenings and in winter) and drifts with the wind.
- Washing on lines in some gardens, moving in the wind.
- A tractor works a field near the road, back and forth, raising dust in dry weather.
- Sailing boats on the sea along the coast.
- Gusts roll across the grass in broad waves, bending it and showing its paler side.
- New houses: bungalows with hipped roofs and modern houses with flat roofs, timber cladding and large windows. Weeping willows on the banks of lakes.
- Landmarks every few kilometres, announced as you approach: a lighthouse with its keeper's cottage and a turning beam at night on the coast, a ruined castle on a hill or a windmill with turning sails in the countryside, a waterfall or a viewpoint lay-by (benches, a telescope and a sign) in the mountains, and a stone arch in the desert.

## Version 3.12: a more natural countryside

- Barriers along drops: low dry-stone walls with an uneven top and the odd gap in the countryside, wooden posts with two rails elsewhere (instead of long grey blocks).
- The road surface: no more repeating dark patches. The asphalt has gentle variation along the whole journey, patched sections, wheel-worn lanes and slightly faded paint.
- Wet roads: after rain the tarmac turns dark and glossy, puddles reflect the sky, and it dries slowly once the rain stops.
- Trees: broadleaf trees have layered crowns of varied shapes (oak, ash and lime-like) and leaning trunks with limbs. Trees now also grow in small woods away from the road, and as hedgerow trees along field boundaries.
- Grass: thick and tall beside the road, thinner and shorter further out, with meadow patches of golden, sage and deep green.
- Houses: more wall and roof colours, stone cottages with dressed corners, one or two chimneys, front gardens with a picket fence, hedge or low stone wall, flower beds and a garden tree. Farmhouses and barns sit at the end of a gravel farm lane from the road.
- Tunnels: an arched stone face set into the hill, with a ring of dressed stones and a keystone and wing walls stepping down into the slope; inside, a vaulted ceiling with lights along the crown.
- Light: in the early morning mist lies in the valleys until the sun burns it off; a low sun casts long, soft shadows; when the sun is ahead of you, its light shafts stream past clouds, hills and trees.
- Lakes under bridges have moving ripples and reflect more of the sky at a low angle.

## Version 3.11: modern car, softer look, open tunnels

- Your car is now a modern coupé: low and wide with a long bonnet, a sloping glass roof, big wheels and tinted windows, so the chase camera shows the car, not the driver. In the driver's view the camera sits behind the wheel with a clear view of the road. (The ride is now called "Car".)
- A softer, airier look closer to Slow Roads: gentler colours, shadows lifted towards a pale sky blue, a lighter vignette and cooler, fresher greens in the Green Valley.
- The road is empty by default (Settings > Driving > Traffic to add cars).
- Tunnel entrances are open: the ground no longer stretches across the tunnel mouth like a wall; the hill is built over the tunnel roof instead.

## Version 3.10: every journey is different

- Each new journey (when you open the game, and after every crash) starts with a different road and land, at a different point of the route (green valley, coast, desert, mountains, snow…), with different weather and a different time of day.
- The home-screen sign lists the places ahead on this journey's route, nearest first, with their distances.
- Anything you choose yourself is kept: pick a place on the sign or in Settings, a weather, or a time of day (which turns off "Let time pass"), and new journeys use your choice.
- Journey codes now also remember the starting point, so a shared code gives exactly the same start.
- Add ?seed=12345 to the address to drive a particular road.

## Version 3.9: a bigger world and reasons to keep driving

- Bridges and tunnels: where the road would sit high on an embankment it crosses a stone bridge on piers, often over a lake or river; where it would cut deep into a hill it goes through a lit tunnel with stone portals. About one every kilometre on Normal (fewer on Relaxed, more on Twisty).
- Villages every few kilometres in the countryside, on the coast and in the mountains: houses close to the road, a church with a spire, and a petrol station.
- Animals: flocks of sheep and herds of cows in the fields, deer near the woods at dawn and dusk, and flocks of birds crossing the sky by day.
- Settings > Driving > Traffic: None, Light or Busy. Traffic now includes vans, a slow tractor and a car towing a caravan.
- Photo mode (P, or the Photo button): the journey pauses and the display hides; drag to look around the vehicle, scroll to zoom, hide the vehicle if you like, and Save picture downloads a PNG.
- Journal (home screen): total and longest distance, places visited (as road-sign stamps), 13 achievements, and your journey code.
- Journey codes: the same code always gives the same road, land and scenery. Copy yours to share it, enter a friend's, or press New road for a fresh one.
- Continue: your journey is saved every few seconds; the home screen offers to continue where you left off (a crash ends the saved journey).
- Game controllers: left stick steers, right trigger accelerates, left trigger brakes; A starts, Y changes the camera, X opens photo mode, Start pauses, Back hides the display.
- Settings > Driving > Map: a compass (default), a mini-map of the road ahead, or off.
- GET_ASSETS.bat now also saves the interface fonts into dist/fonts, so the game looks right without internet.

## Version 3.8: better looks, damage and gears

- The Wild Coast ends in steep cliffs about 110 m from the road, with boulders at their foot and white surf where the waves meet the rocks.
- The sea moves: rolling swells and fine ripples, with sunlight glittering on the water.
- Dry stone walls are built from stacked, uneven stones with upright capstones; hedges are leafy and rounded.
- Rocks settle into slopes (tilted with the hillside) with a few small stones scattered around them.
- Another world has its own look at night: glowing crystal plants and glowing pylons along drops instead of crash barriers, and two large moons in the sky.
- Clouds are billowy with ragged edges, warm undersides at sunset and bright silver linings when the sun is behind them.
- Damage instead of instant loss: a light knock (under about 25 km/h) dents the vehicle and a damage bar appears; it starts smoking when badly damaged. A hard hit, or one knock too many, still totals it and returns you to the menu. Driving into the sea always does.
- When you drive yourself, the dashboard shows the gear (automatic gearbox) and a rev bar; the engine sound follows the same gears.
- The coach's driver's view shows the cab: steering wheel, dashboard, windscreen pillars and mirrors.

## Version 3.7: driving, vehicles, sound and crashes

- Real (but light) driving physics: acceleration, braking and engine drag per vehicle, hills slow you down, steering gets gentler with speed and has a grip limit (less grip in rain and snow), the body nods under braking, rolls in bends (motorbikes and bicycles lean into them), bumps on rough ground, and can leave the ground over a crest.
- Autodrive (Settings > Driving > Who drives) keeps to the lane, slows for bends ahead and keeps a safe distance behind slower cars. "I'll drive" gives you the wheel: W/↑ accelerate, S/↓ brake, A D / ← → steer.
- A coach joins the roadster, motorbike and bicycle. Each has its own speed, handling, size, camera distance and engine sound.
- Crashes: hitting anything (a barrier, another car, a tree, rock, house, pole, sign, stone wall, hedge or fence) or driving into the sea totals the vehicle. A "Totalled" sign shows how far you got, then the game returns to the main menu (or press Back to the menu). Gaps for gates in walls are passable.
- Sound (Settings > Driving > Sound, or the speaker button): an engine with gears that responds to the accelerator, tyres on tarmac and gravel, tyre squeal near the grip limit, wind rising with speed, rain, birds in the countryside, surf on the coast, wind in the hills and desert, a low hum on the alien world, and an optional calm radio of slow generated chords.
- A fourth camera: Cinematic (press C to cycle) films you from the roadside as you pass.
- The display fades after a few quiet seconds while driving and comes back when you move the mouse or press a key. H hides everything on screen.

## Version 3.6: new home screen and menu

- The look is borrowed from the road: guide-sign green with a white border, warning-sign yellow for whatever is selected, and highway-style lettering (Overpass and Big Shoulders Display, loaded from Google Fonts; without internet the game falls back to system fonts).
- Home screen: the Everway title, a short line, and a green highway sign listing the places ahead with their distances. Click a place to start there, or keep "All the way" to let the road decide. Then press Start driving.
- The menu (top right) is grouped into three tabs: Trip (ride, place, season, road), Sky (time of day on a day-to-night slider, weather) and Driving (who drives, speed, view distance, graphics, keys). Places are shown as small landscape pictures, rides and road types as icons.
- While driving: the current region on a small road sign at the top, speed inside a speed-limit roundel, plain-language conditions, and icon buttons for camera, sound and fullscreen.

## Version 3.5: scenery, environments and seasons

- Field boundaries: dry stone walls, hedges and wooden fences run beside the road and away from it between fields, with gaps for gates. They follow the ground over hills.
- Wildflowers in the grass (most in spring, none in winter).
- New trees: slender white birches and tall narrow spruces, alongside the existing broadleaf trees, poplars and pines.
- Bend warning signs (yellow, with a chevron) before sharper bends.
- Two new environments in Settings > The surroundings:
  - The wild coast: the land ends in cliffs above the sea a couple of hundred metres from the road. Part of the automatic journey.
  - Another world: red dust, rock spires and boulders under a peach-coloured sky. Choose it from the menu; it is not part of the automatic journey.
- Settings > Season: Spring (fresh green, many flowers), Summer, Autumn (orange, red and gold leaves, browner ground), Winter (snow on the ground, bare broadleaf trees, snow on conifers, snowy weather). The desert and the alien world do not change with the seasons.
- The sea is a little darker and less mirror-like.

## Version 3.4: terrain and look

- Land to the horizon: beyond the detailed 400 m either side of the road, a coarser copy of the same land reaches out to the view distance and follows you as you drive.
- Settings > View distance: Short (lightest), Medium (default), Far, Very far. Longer views thin the haze and move the mountain backdrop further back.
- The sea: on some stretches the land falls away to the sea on one side, beyond about 500 m. Low land near sea level turns to beach. The road always stays above the water.
- Ground textures no longer visibly repeat (each texture is blended with shifted copies of itself), patches of bare soil show through the grass, and steep cuttings are textured from the side so the pattern is not stretched. Moderate slopes stay grassy; bare rock only shows where it is steep.
- Height haze: valleys and low ground gather soft haze, high ground stays clearer.
- A calmer look: slightly lower colour saturation, gentler bloom and softer shadows.
- Fixed: shading stripes on distant flat ground (ambient shadowing now fades out with distance).

## Version 3.3: the road

The road now climbs, dips and winds through the land, which is shaped around it.

- The road is planned about 4 km ahead: bends of varying tightness joined by smooth transitions, and hills that follow the land within safe gradients. It always heads away from you, so it never crosses itself or turns back.
- Settings > The road: Relaxed (long sweeping bends, gentle hills), Normal, or Twisty (tight bends, steep hills, a slightly narrower road).
- The surface is banked in bends with a slight crown, and the car tilts and pitches with it.
- Cuttings where the road passes through rises and embankments where it crosses dips. Stone walls (countryside, mountains, snow) or steel rails (desert, town) run along the bigger drops.
- Speed is now measured along the road, so the distance counter is exact on bends.
- With ?debug, the road map turns with the real bends and shows the height profile, the current height and the gradient.

Tested over 100 km of generated road for each setting: gradients stay under 5% (Relaxed), 7.5% (Normal) and 10% (Twisty), the tightest bends are about 420 m, 190 m and 75 m in radius, and no stretch stays flat for more than about 700 m.

## Version 3.2: engine foundations

No visible change: this version rebuilds the engine underneath so the next steps (hills, longer views, better physics) have a solid base.

- The single 83 KB world file is now 24 small modules (listed under Source).
- One road service answers every "where is the road?" question.
- Road sections, terrain, grass and scenery are recycled from pools instead of being created and thrown away, and the frame loop no longer creates temporary objects.
- A scheduler builds the world within a time budget each frame, ready to move into a background worker later.
- A ?debug performance panel, a top-down road map and screenshot tests for every region at noon, golden hour and night.

## Put it on the web

Everway is a plain static website: everything it needs is in the dist folder, with no server code. To put it online, upload the whole dist folder to any static host. Three easy ways:

- Netlify Drop: open app.netlify.com/drop and drag the dist folder onto the page. You get a link at once.
- Vercel: put the dist folder in a GitHub repository (or run `vercel` inside it) and deploy it as a static site with no build command.
- GitHub Pages: put the contents of dist in a repository and turn on Pages for it in the repository settings.

The fonts load from Google Fonts online, so the dist/fonts folder (from GET_ASSETS.bat) is optional. The realistic scenery models are optional too; without them the game uses its own built-in models.

## Graphics and verification

Use a browser with hardware acceleration and WebGL 2 enabled for full 3D graphics. Settings display HIGH GRAPHICS when the full renderer is running, or COMPATIBILITY GRAPHICS when the simplified Canvas renderer is active. Compatibility mode has reduced visual effects and performance.

Version 2 was visually checked in headless Chromium (software WebGL) across all five regions, day/golden hour/night, rain, snow and wind, all three rides and the Fast graphics path. The no-WebGL fallback was checked too. Add ?quality=high|balanced|low to the URL to force a graphics level.

This is a stylized procedural prototype, not a photorealistic driving simulator. Weather has visual effects but does not simulate detailed tyre grip. Traffic has basic following logic; junctions and overtaking are not implemented. Biomes change at generated road sections.

## Developer tools

Add ?debug to the address (for example http://localhost:8000/?debug) to show:

- A performance panel: frame time (average, worst, and how many frames went over 20 ms), world-generation time per frame, draw calls, triangles, GPU memory, object pool use and live road sections. Press F3 to hide it.
- A top-down map of the next 3 km of road. Built sections are green, queued ones amber, and the strip on the left shows the region.
- Hooks in window.__ev for automated tests: snap() captures a frame, freeze() stops all animation so two runs give the same picture, idle() reports when every queued section is built, and timeChunk(i) times the steps of building one section.

## Source

- dist/app.js — starts the WebGL 2 world, or the compatibility version.
- dist/world.js — the frame loop; it calls the engine modules below in order.
- dist/engine/ — the WebGL 2 world, one module per job:
  - road.js — the road planner and service: position, height, heading, banking, gradient and width at any distance, and the distance from any point to the centre line. Everything that sits on or beside the road asks here.
  - terrain.js — ground height and colour everywhere: the open land with the road cut into it, coast and beaches.
  - far.js — the far land beyond the detailed sections, the sea and the view distance setting.
  - look.js — height haze.
  - season.js — season colours, leaves, flowers and snow cover.
  - chunks.js — builds 120 m road sections ahead (terrain, road surface, scenery, grass) and recycles them behind.
  - scheduler.js — runs section building a few milliseconds per frame, so it never causes a stutter.
  - pool.js — recycles geometry and instanced meshes instead of creating new ones while driving.
  - biomes.js, templates.js, materials.js, textures.js — regions, shapes, materials and generated textures.
  - sky.js, lighting.js, post.js — sky, clouds and mountains; sun, moon and time of day; bloom, ambient occlusion and tone mapping.
  - physics.js, vehicle.js, camera.js — driving physics, autodrive and crashes; player and traffic placement; camera views.
  - obstacles.js, coach.js — what you can crash into; the coach, van, tractor and caravan models.
  - fork.js, replay.js, details.js — forks in the road; replays; indicators, hazard lights and wipers.
  - trip.js — side roads to a beach, a farm or a viewpoint.
  - events.js — sheep, deer, roadworks and the tractor turning off.
  - birds.js, photo.js, progress.js — birds; photo mode; saved journey, journal, achievements and journey codes.
  - life.js — chimney smoke, waterfall spray, the field tractor, sailing boats, turning sails, the lighthouse beam and landmark notices.
  - reflect.js — mirrored reflections on lakes.
  - weather.js, audio.js — weather changes and rain/snow; all sound, including the radio.
  - hud.js, ui.js, quality.js, debug.js — dashboard read-outs, controls, graphics levels, developer tools.
  - render.js, state.js, core.js, actors.js — renderer and scene, shared state, helpers, lights and vehicles.
- dist/legacy.js — original world, used with the compatibility renderer.
- dist/assets.js — loads the optional downloaded scenery (includes a small glTF reader).
- get_assets.py and GET_ASSETS.bat — download the realistic scenery.
- dist/vehicles.js — vehicle models and rider animation.
- dist/cars.js — detailed car bodies, cabins and wheels.
- dist/software.js — compatibility renderer.
- dist/style.css and dist/index.html — interface.
- dist/three.module.js and dist/three.core.js — bundled Three.js.
- dist/THREE-LICENSE.txt — upstream license.
- server.py and START_WINDOWS.bat — local launcher.
