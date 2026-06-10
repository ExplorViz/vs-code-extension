# Minimal Debug Toy

Dieses Projekt ist absichtlich minimal:

- eine `Main`
- eine Datenklasse `DebugObject`
- zwei Breakpoint-Kommentare:
  - `SNAPSHOT_X_BREAKPOINT`
  - `SNAPSHOT_Y_BREAKPOINT`

## Start

```bash
mvn compile exec:java
```

## Breakpoints

Setze Breakpoints in:

```text
src/main/java/net/explorviz/debugtoy/Main.java
```

bei:

```java
// SNAPSHOT_X_BREAKPOINT
// SNAPSHOT_Y_BREAKPOINT
```

## Idee

In Snapshot X existieren mehrere Objektinstanzen in einer Map.

Zwischen Snapshot X und Snapshot Y werden:

- einige Instanzen entfernt
- einige Instanzen beibehalten
- bei einer beibehaltenen Instanz nur manche Felder geändert
- bei einer anderen beibehaltenen Instanz alle Felder geändert
- neue Instanzen erzeugt
- bei einzelnen Instanzen Felder auf `null` gesetzt, um Variablen zu simulieren, die im anderen Snapshot nicht vorhanden sind

Die Felder decken `String`, `int`, `float`, `double` und `boolean` ab.
