# Taste Buds: PRD
Mode: Comprehensive - Owner: Pete - Status: Draft - Date: 2026-09-25

## Problem
Root beer connoisseurs currently track which root beers they have tasted using spreadsheets, which is a clunky, disconnected experience. To find new root beers, the community relies on a well known shared Google Map of locations that carry root beer, but the map only shows where to look, not what specific brands or types are available at each pin. This means connoisseurs open many pins without knowing whether the location has something they have not already tried, wasting trips. There is also no connected way to find where to buy specific root beers online, with expected cost, or to easily get ratings, notes, and phone photos or videos of a tasting into a single record.

## Target users
Primary: root beer connoisseurs, specifically a closed group of five, Pete and four friends who run a root beer club together. Within that group there are two overlapping motivations: trackers, who want a reliable record of what they have tasted, rated, and where they got it, especially once the list runs into the hundreds of brands; and hunters, who actively chase root beers they have not tried yet and will go out of their way or pay extra for a new find. The product should be built so any root beer connoisseur could use it, but the core design target is this group of five.

Not for: casual root beer drinkers with no interest in tracking or hunting; general public or stranger based social discovery is out of scope for v1 (see Non-goals).

## Success criteria
Not tracked as a formal metric. This is a personal, hobby project for a five person group; success is subjective enjoyment and adoption by the group rather than a KPI. The closest thing to a milestone is all five members migrating their existing spreadsheets into the tool and using it going forward instead of the spreadsheet. Related idea, not yet a requirement: a way to pull in photos or videos people already took on their phone when they rated a root beer but never logged it in a spreadsheet.

## Non-goals
- No public or stranger facing social discovery features in v1. The product is scoped to the five club members, even though it is built so it could extend to other connoisseurs later.
- No in-app purchases or payment processing in v1. The app links out to where a root beer can be bought rather than handling the transaction. Affiliate links or a markup based monetization model are a possible future direction, not a current requirement.
- No crowdsourced stock or availability verification in v1. Keeping map and directory data current (a store selling out, discontinuing a root beer, and so on) is a real problem but a big one, requiring crowdsourced reporting to solve properly. Deliberately deferred; tracked below as a roadmap item, not addressed now.

## Requirements
Priority key: must / should / won't.

1. **Must.** Individual accounts. Each of the five members has their own login and their own log.
   Acceptance criteria: a user can create an account, log in, and see only their own tasting log by default.
2. **Must.** Spreadsheet import. Users can import one or more existing spreadsheets of previously tasted root beers into the app, repeatable at different times, not a continuous or live sync with an external file.
   Acceptance criteria: a user can upload a spreadsheet file and have its rows appear as entries in their log without needing to re-import to see prior imports.
3. **Must.** Logging a root beer. A user can create an entry for a root beer with a rating on a zero to ten scale (ten best, zero worst), free text notes, and attached photos or video.
   Acceptance criteria: an entry can be saved with a rating, notes, and at least one photo or video attachment, and can be edited later.
4. **Must.** Map of locations. A map shows locations that carry root beer, and unlike the existing shared community map, each pin indicates the specific root beer brand or type available there.
   Acceptance criteria: selecting a pin shows the specific root beer(s) known to be available at that location, not just that the location carries root beer generally.
5. **Must.** Online purchase directory. A directory of where specific root beers can be purchased online, including expected cost, linking out to the purchase page rather than handling checkout.
   Acceptance criteria: a root beer's directory entry includes at least one outbound purchase link and an expected price.
6. **Must.** Directory filtering and sorting. Users can filter the root beer directory by whether they have tasted it and by their own rating, and sort by rating from highest to lowest.
   Acceptance criteria: a user can view only untasted root beers, and can sort their tasted list from highest to lowest rated.
7. **Must.** Favoriting. Users can mark a root beer as a favorite.
   Acceptance criteria: a favorited root beer is visibly distinguishable and retrievable as a filtered view.
8. **Must.** Leaderboard. A view aggregating ratings across all five members for each root beer, filterable, so the group can see collective favorites rather than only individual ratings.
   Acceptance criteria: a user can view root beers ranked by combined or average rating across all five members, and filter that view.
9. **Should.** Nearby root beer. Using the device's real-time location, show root beers and locations near the user right now, useful for travel or spontaneous discovery.
   Acceptance criteria: a user can request "what's around me" and get a list or map view of nearby root beer locations based on current position.

## Alternatives considered
- **Status quo (spreadsheet plus shared Google Map plus phone photos and video).** Rejected as too clunky and disconnected between the three separate tools, and the map does not show what root beer is actually at a location.
- **An existing app on the market.** Not specifically researched. Rejected on principle, the group does not want to pay for a tool for this. Building it themselves is also part of the appeal.

## Open questions
- Whether photo or video capture on a phone can be surfaced or imported into the app when a rating exists on video but was never logged (raised as a nice-to-have under Success criteria, not yet scoped as a requirement).
- No formal success metric was defined; revisit if the project grows beyond the five person group.
- Whether two members rating the same root beer differently should show both ratings side by side (feeds the leaderboard, requirement 8) or stay purely personal per log; the leaderboard requirement assumes ratings are visible across the group, but the display format for disagreement is not yet decided.

## Roadmap (explicitly out of scope for now)
- Crowdsourced stock and availability verification, so map and directory listings stay current as stores sell out or stop carrying a given root beer. Confirmed as a real need but deliberately deferred; requires a reporting mechanism that is a bigger build than v1 warrants.

## Source appendix
Not applicable. All content in this document came directly from the user in this conversation.
