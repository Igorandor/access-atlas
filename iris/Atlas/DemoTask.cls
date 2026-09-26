/// Safe integration-test task. Writes a timestamp only to the Atlas demo global.
Class Atlas.DemoTask Extends %SYS.Task.Definition
{
/// Test-only worker. Never started by the portal automatically.
ClassMethod Worker()
{
    Set ^AtlasDemo("workerPid")=$JOB
    Hang 120
}
Parameter TaskName = "Atlas demonstration task";
Method OnTask() As %Status
{
    Set ^AtlasDemo("lastRun")=$ZDATETIME($HOROLOG,3)
    Quit $$$OK
}
}
