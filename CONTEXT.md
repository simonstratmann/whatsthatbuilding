# What Is That Building

Lets someone out walking point their phone at a building, identify it, and open its location in their maps app.

## Language

### Aiming

**Crosshair**:
The fixed marker in the camera view that shows which building the user means.
_Avoid_: Reticle, target

**Snapshot**:
The moment the user presses the shutter with the Crosshair on a building, recording their position, the direction they are facing and how far up they tilt the phone. The tilt says which building on the Line of Sight they mean: the house in front, or the tower above it; the building it points at ranks first.
_Avoid_: Picture, image, capture

**Line of Sight**:
The direction from the user's position along their facing direction at the Snapshot, on which the intended building is assumed to lie.
_Avoid_: Ray, bearing line, view direction

### Identifying

**Sight Cone**:
The wedge-shaped area around the Line of Sight, limited in angle and distance, in which buildings are considered. It absorbs compass inaccuracy and includes buildings hidden behind nearer ones. It starts 20 m out: buildings nearer than that are left out altogether (not offered, not drawn, hiding nothing), since the one the user stands in front of is easy to find on any map; the app is for those farther off.
_Avoid_: Search area, field of view, radius

**Footprint**:
A building's outline on the ground, with its height, function and address, taken from the official LoD2 building model of the Coverage Area.
_Avoid_: Shape, polygon, outline

**Building Shell**:
A building's wall, roof and ground surfaces in 3D, from the same LoD2 building model as its Footprint. The Sight View draws it.
_Avoid_: Model, mesh, geometry

**Coverage Area**:
Where the app has building data: Niedersachsen and Hamburg. A Snapshot outside it gets no Candidates, only a message saying so.
_Avoid_: Region, supported area

**Candidate**:
A building whose Footprint lies in the Sight Cone, offered for the user to choose from. The user always picks one; the app never decides alone.
_Avoid_: Match, result, suggestion

**Building Type**:
What a building is used for, in a short German word or two ("Wohnhaus", "Kirche"), named from the AdV function code of its Footprint. Shown in the Candidate list next to the height.
_Avoid_: Function (that's the code), category, use

**Hidden Candidate**:
A Candidate that nearer, taller buildings block completely as seen from the user's position. It stays in the list but ranks below Candidates the user can see. Buildings lower than 5 m (garages, sheds, kiosks) rank below both. The three tallest Candidates the user can see always make the list, however many nearer ones there are: the app is for buildings a bit farther off.
_Avoid_: Occluded, covered

**Label**:
How a Candidate is named to the user: its name from OpenStreetMap when one exists, otherwise its address from the building model.
_Avoid_: Title, caption

**Location**:
The centre point of the chosen building, labelled with its Label when it has one, handed to the user's default maps app. For now it is the only answer the app gives.
_Avoid_: Address, place, result

### Map

**Aerial Photo**:
The orthophoto layer (DOP) the mini-map can show instead of the street map, served by the backend from the LGLN or Hamburg imagery services.
_Avoid_: Satellite image, orthophoto, DOP

**Sight View**:
A drawing of the Candidates and their Surroundings as seen from the user's position at the Snapshot, facing their heading, with each Candidate numbered as in the list. It shares the mini-map's box, behind a View | Map toggle.
_Avoid_: 3D view, render, preview

**Surroundings**:
Buildings within ±30° of the heading and the Sight Cone's range that aren't Candidates and that nearer buildings don't hide completely. The Sight View draws them in grey so the user can orient themselves; they can't be chosen.
_Avoid_: Context, background buildings
