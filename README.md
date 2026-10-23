# Clash Claude

A mobile village-building strategy game in the spirit of Clash of Clans, written in plain
HTML5 canvas + JavaScript. No build step, no dependencies, and all art is drawn in code.

You start as the chief of a tiny village with just a Town Hall, a Builder's Hut and the ruins of a
Clan Castle. Build it up, train an army, raid goblins and other villages, then join a clan.

## Play

Serve the folder with any static web server and open it on your phone (landscape works best):

```sh
npx http-server -p 8080 .     # or: python3 -m http.server 8080
```

Then open `http://<your-computer-ip>:8080` on your phone. It also works on GitHub Pages. Use your
browser's "Add to Home Screen" to install it as a full-screen app; it then works offline too.

Progress is saved automatically in the browser (localStorage).

## Features

- **Village**: isometric 44×44 map, 13 building types with up to 6 levels each, Town Hall levels 1–6
  that unlock more buildings, builders and build timers, finish-now with gems, obstacles
  to clear (they can contain gems), drag-to-move buildings, walls that keep placing in a line.
- **Economy**: Gold Mines and Elixir Collectors produce over time (even while the game is closed),
  storages cap how much you can hold, gems buy missing resources.
- **Army**: Barracks train Barbarians, Archers, Goblins, Giants and Wall Breakers; Army Camps hold
  them. Troop level follows your Town Hall level.
- **Battles**: tap or hold to deploy outside the red zone. Troops path-find around buildings, break
  walls when there is no way around, and pick targets the way you'd expect (Giants go for defenses,
  Goblins for loot, Wall Breakers for walls). Cannons, Archer Towers and splash-damage Mortars fight
  back. 50% destruction, the Town Hall and 100% are each worth a star.
- **Single player**: 10 Goblin maps with one-time loot and stars.
- **Multiplayer-style raids**: "Find a Match" generates enemy villages around your Town Hall level
  with loot and trophies on the line.
- **Clans** (rebuild the Clan Castle first): browse and join a clan or found your own; up to 50
  members; clan chat; request troops and get donations that join your attacks; donate your own
  troops to clanmates' requests.
- **Clan Wars**: preparation day then battle day, two attacks each, AI clanmates and opponents
  attack too; the clan with more stars wins bonus loot.
- **Clan Capital**: contribute gold to upgrade the Capital Hall and unlock districts.
- **Tutorial** that follows the original opening: the Goblin Horde attacks and you set up a Cannon.

Clanmates and opponents are simulated in the browser; there is no server.

## Controls

| Action | Touch | Mouse |
| --- | --- | --- |
| Move camera | drag | drag |
| Zoom | pinch | wheel |
| Select / collect | tap | click |
| Move a building | select it, then drag it | same |
| Deploy troops | tap or hold on grass | click / hold |

## Code layout

| File | Purpose |
| --- | --- |
| `js/data.js` | Buildings, troops, limits per Town Hall, campaign, names |
| `js/village.js` | Save state, economy, building/upgrade/training logic |
| `js/render.js` | Camera, isometric drawing, procedural building and troop art |
| `js/battle.js` | Enemy village generator and battle simulation (flow-field pathing) |
| `js/clan.js` | Simulated clan: chat, donations, wars, capital |
| `js/ui.js` | HUD, panels, modals, battle HUD, tutorial |
| `js/main.js` | Game loop, input (touch/mouse), mode switching |
| `sw.js`, `manifest.json` | Offline support / installable app |

Fan-made project; not affiliated with or endorsed by Supercell.
