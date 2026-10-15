When you are finished, answer ONLY with one JSON object, nothing after it:
{"next": "<one of the allowed values for next>", "data": {<fields to add or update on this item>}, "spawn": [{"ti": "<title>", "d": {<data>}}], "say": "<one short sentence: what you did>"}
- next: where the item goes now. Use "drop" only if the item is invalid, impossible or not worth doing, and say why.
- data: keep it compact. Put long results into files and store the path.
- spawn (optional): new items for the stage {spawn}. Leave it out if you create none.
