# Security policy

## Reporting a vulnerability

Please report suspected vulnerabilities privately through the repository's **Security** tab using **Report a vulnerability**, when that option is available. Do not publish API keys, exact location history, or private ride details in an issue.

If private vulnerability reporting is unavailable, use a private contact method published by the repository owner, if available. Do not post exploit details in a public issue.

## Supported versions

There is no supported release policy yet. Security fixes, when available, will target the current default branch.

## Configuration and location data

The TomTom value named EXPO_PUBLIC_TOMTOM_API_KEY is used by the client for place search and map requests. It is not a server secret. Do not commit local environment files or put private credentials in this variable. If a provider key is exposed, rotate it in the provider account.

When reporting a location-related issue, use a broad, non-personal test area and remove exact coordinates, home/work addresses, and trip history.