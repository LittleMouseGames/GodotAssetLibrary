# Godot Library

**What is this:**
An Open Source (AGPLv3) Godot Asset Library

Features:
* Asset mirroring from the default library
* Asset review and rating system
* User accounts and new asset adding
* Open Source 😎
  
## Running
### Docker based envrionment
Run:
```
docker compose up -d
```

To tail nodejs:
```
docker logs nodejs -f
```

### Non docker based development:
```
npm run devel
```

For linting:
```
npm run lint
```

## Folder Structure
```
 src
  └───backend             # Backend / dynamic 
    │   RouterServer.ts   # Start our router
    │   MongoHelper.ts    # Our MongoDB helper
    │   start.ts          # App entry point
    └───components        # Reusuable eta.js templates
    └───modules           # Each site module (ex, admin area, blog area, etc) 
      └─── ModuleName     # Module Example
        │───controllers   # Module controllers
        │───jobs          # Cron / scheduled jobs
        │───models        # Database models
        │───services      # All the business logic
        │───views         # Store the Views for the module (eta.js templates)
    └───utility           # All our utility classes, like loggers
  └───frontend            # Frontend assets (ex pre-compiled or static)

```

**Controllers**
Controllers do not handle business logic. They interpret routes, call our services and return the data

**Services**
Services handle all our buisness logic

**Models**
Our DB models

**Jobs**
Spot to put cron jobs or other scheduled jobs

**Views**
Our ETA templates and relevant SCSS for the page

## Style guide
All functions will have a `DocBlock` to describe its purpose
```js
/**
* Short function description
*/
function name () {
  ...
}
```

All functions will be static typed
```js
/**
* Print name and age to console
*/
function name (name: string, age: number): void {
  console.log(name, age)
}
```

All functions will have full docblocks ( for API generation and editor hints )
```js
/**
* Print name and age to console
* 
* @param {string} name the users name
* @param {number} age the users age
* @returns {void}
*/
function name (name: string, age: number): void {
  console.log(name, age)
}
```

Filenames to match class names
```js
// GetCoffee.ts
export class GetCoffee {
  ...
}
```

## Code guide
* Models can (and should!) throw errors
* Following TS Standard (as best as resonably possible)
