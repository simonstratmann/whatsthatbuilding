# What Is That Building

Lets someone out walking point their phone at a building, identify it, and open its location in their maps app.

## Language

### Aiming

**Crosshair**:
The fixed marker in the camera view that shows which building the user means.
_Avoid_: Reticle, target

**Snapshot**:
The moment the user presses the shutter with the Crosshair on a building, recording their position and the direction they are facing.
_Avoid_: Picture, image, capture

**Line of Sight**:
The direction from the user's position along their facing direction at the Snapshot, on which the intended building is assumed to lie.
_Avoid_: Ray, bearing line, view direction

### Identifying

**Sight Cone**:
The wedge-shaped area around the Line of Sight, limited in angle and distance, in which buildings are considered. It absorbs compass inaccuracy and includes buildings hidden behind nearer ones.
_Avoid_: Search area, field of view, radius

**Footprint**:
A building's outline on the ground, with its height, function and address, taken from the official LoD2 building model of the Coverage Area.
_Avoid_: Shape, polygon, outline

**Coverage Area**:
Where the app has building data: Niedersachsen and Hamburg. A Snapshot outside it gets no Candidates, only a message saying so.
_Avoid_: Region, supported area

**Candidate**:
A building whose Footprint lies in the Sight Cone, offered for the user to choose from. The user always picks one; the app never decides alone.
_Avoid_: Match, result, suggestion

**Hidden Candidate**:
A Candidate that nearer, taller buildings block completely as seen from the user's position. It stays in the list but ranks below Candidates the user can see.
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
