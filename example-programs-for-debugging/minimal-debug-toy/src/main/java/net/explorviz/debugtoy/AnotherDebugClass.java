package net.explorviz.debugtoy;

public class AnotherDebugClass {

  private final String instanceId;
  private int newAttribute;
  
  public AnotherDebugClass(
      final String instanceId,
      final int newAttribute) {
    this.instanceId = instanceId;
    this.newAttribute = newAttribute;
  }

  public String getInstanceId() {
    return instanceId;
  }

  public void setNewAttribute(final int newAttribute) {
    this.newAttribute = newAttribute;
  }

  @Override
  public String toString() {
    return instanceId
        + "{newAttribute='" + newAttribute + '\''
        + '}';
  }
}
