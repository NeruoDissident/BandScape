# BandScape Data Schema

This document defines the data schema for nodes and links in the BandScape application.

## Node Types

The `type` field determines the kind of node. The following node types are supported:

- `band`: Represents a musical group.
- `member`: Represents an individual musician.
- `venue`: Represents a location where bands perform.
- `event`: Represents a specific performance or festival.
- `tag`: Represents a genre, instrument, or other descriptive label.

## Common Node Fields

All nodes share the following common fields:

- `id` (string, required): A unique identifier for the node (e.g., "band_1", "member_1").
- `type` (string, required): The node type, from the list above.
- `name` (string, required): The primary name of the node.
- `aliases` (array of strings): Alternative names or spellings.
- `description` (string): A detailed description of the node.
- `image_url` (string): A URL for an image of the node.
- `website_url` (string): The official website of the node.
- `socials` (object): A collection of social media links, where keys are the platform name (e.g., "twitter", "facebook") and values are the URLs.
- `location` (object): The geographical location of the node.
  - `lat` (number): Latitude.
  - `lng` (number): Longitude.
  - `city` (string): The city name.
  - `country` (string): The country name.
- `start_date` (string): The start date of the node's activity (e.g., formation date for a band).
- `end_date` (string): The end date of the node's activity (e.g., breakup date for a band).
- `origin` (string): The place of origin for the node.
- `tag_ids` (array of strings): A list of tag node IDs associated with this node.

## Link Object

Links represent the relationships between nodes.

- `source` (string, required): The ID of the source node.
- `target` (string, required): The ID of the target node.
- `type` (string, required): The type of relationship.
- `description` (string): A description of the relationship.
- `start_date` (string): The start date of the relationship.
- `end_date` (string): The end date of the relationship.

## Link Types

The `type` field in a link object can be one of the following:

- `member_of`: A person is a member of a band.
- `formed_in`: A band was formed in a location.
- `played_at`: A band played at a venue.
- `headlined`: A band headlined an event.
- `opened_for`: A band opened for another band at an event.
