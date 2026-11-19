package net.explorviz.debugtoy;

import java.util.LinkedHashMap;
import java.util.Map;

public class Main {

  public static void main(final String[] args) {
    final Map<String, DebugClass> objects = new LinkedHashMap<>();
    final Map<String, AnotherDebugClass> anotherObjects = new LinkedHashMap<>();

    anotherObjects.put(
      "another-object-in-x-1",
      new AnotherDebugClass(
        "another-object-in-x-1",
        42
      )
    );

    anotherObjects.put(
      "another-object-in-x-2",
      new AnotherDebugClass(
        "another-object-in-x-2",
        24
      )
    );

    objects.put(
        "object-only-in-x-1",
        new DebugClass(
            "object-only-in-x-1",
            "ONLY_IN_X",
            1,
            0.10f,
            0.100000001d,
            true,
            "x-only-string",
            100,
            null,
            null));

    objects.put(
        "object-shared-partially-changed",
        new DebugClass(
            "object-shared-partially-changed",
            "RUNNING",
            2,
            0.25f,
            0.250000001d,
            true,
            null,
            null,
            null,
            null));

    objects.put(
        "object-shared-fully-changed",
        new DebugClass(
            "object-shared-fully-changed",
            "RUNNING",
            3,
            0.40f,
            0.400000001d,
            true,
            null,
            null,
            null,
            null));

    objects.put(
        "object-only-in-x-2",
        new DebugClass(
            "object-only-in-x-2",
            "FAILED",
            4,
            0.70f,
            0.700000001d,
            false,
            "another-x-only-string",
            200,
            null,
            null));

    printSnapshot("SNAPSHOT X", objects);

    // SNAPSHOT_X_BREAKPOINT
    keepAlive(objects, anotherObjects); // prevents garbage collection


    objects.remove("object-only-in-x-1");
    objects.remove("object-only-in-x-2");

    final DebugClass partiallyChanged = objects.get("object-shared-partially-changed");
    partiallyChanged.setState("THROTTLED");
    partiallyChanged.setDoubleValue(0.950000001d);
    partiallyChanged.setCount(2);
    partiallyChanged.setLoad(0.25f);
    partiallyChanged.setActive(true);

    final DebugClass fullyChanged = objects.get("object-shared-fully-changed");
    fullyChanged.setState("OVERLOADED");
    fullyChanged.setCount(30);
    fullyChanged.setLoad(0.95f);
    fullyChanged.setDoubleValue(0.990000001d);
    fullyChanged.setActive(false);

    objects.put(
        "object-only-in-y-1",
        new DebugClass(
            "object-only-in-y-1",
            "STARTING",
            5,
            0.15f,
            0.150000001d,
            true,
            null,
            null,
            "y-only-string",
            300));

    objects.put(
        "object-only-in-y-2",
        new DebugClass(
            "object-only-in-y-2",
            "NEW",
            6,
            0.05f,
            0.050000001d,
            true,
            null,
            null,
            "another-y-only-string",
            400));

    printSnapshot("SNAPSHOT Y", objects);

    // SNAPSHOT_Y_BREAKPOINT
    keepAlive(objects, anotherObjects);
  }

  private static void printSnapshot(
      final String snapshotName,
      final Map<String, DebugClass> objects) {
    System.out.println(snapshotName);
    objects.values().forEach(System.out::println);
    System.out.println();
  }

  private static void keepAlive(final Object object, final Object object2) {
    if (object == null) {
      System.out.println("unreachable");
    }
    if (object2 == null) {
      System.out.println("unreachable2");
    }
  }
}
