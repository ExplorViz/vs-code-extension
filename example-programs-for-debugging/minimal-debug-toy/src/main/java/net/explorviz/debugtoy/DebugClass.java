package net.explorviz.debugtoy;

public class DebugClass {

  private final String instanceId;

  private String state;
  private int count;
  private float load;
  private double doubleValue;
  private boolean active;

  private String stringOnlyInX;
  private Integer intOnlyInX;

  private String stringOnlyInY;
  private Integer intOnlyInY;

  public DebugClass(
      final String instanceId,
      final String state,
      final int count,
      final float load,
      final double doubleValue,
      final boolean active,
      final String stringOnlyInX,
      final Integer intOnlyInX,
      final String stringOnlyInY,
      final Integer intOnlyInY) {
    this.instanceId = instanceId;
    this.state = state;
    this.count = count;
    this.load = load;
    this.doubleValue = doubleValue;
    this.active = active;
    this.stringOnlyInX = stringOnlyInX;
    this.intOnlyInX = intOnlyInX;
    this.stringOnlyInY = stringOnlyInY;
    this.intOnlyInY = intOnlyInY;
  }

  public String getInstanceId() {
    return instanceId;
  }

  public void setState(final String state) {
    this.state = state;
  }

  public void setCount(final int count) {
    this.count = count;
  }

  public void setLoad(final float load) {
    this.load = load;
  }

  public void setDoubleValue(final double doubleValue) {
    this.doubleValue = doubleValue;
  }

  public void setActive(final boolean active) {
    this.active = active;
  }

  @Override
  public String toString() {
    return instanceId
        + "{state='" + state + '\''
        + ", count=" + count
        + ", load=" + load
        + ", doubleValue=" + doubleValue
        + ", active=" + active
        + ", stringOnlyInX='" + stringOnlyInX + '\''
        + ", intOnlyInX=" + intOnlyInX
        + ", stringOnlyInY='" + stringOnlyInY + '\''
        + ", intOnlyInY=" + intOnlyInY
        + '}';
  }
}
