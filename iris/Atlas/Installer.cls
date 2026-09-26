Class Atlas.Installer Extends %RegisteredObject
{
/// Install an authenticated evidence endpoint; do not assign user or application roles.
ClassMethod Install() As %Status
{
    New $Namespace
    Set $Namespace="%SYS"
    Set configuration("NameSpace")="%SYS"
    Set configuration("Resource")="%Admin_Operate"
    Set configuration("DispatchClass")="Atlas.Rest"
    Set configuration("Enabled")=1
    Set configuration("AutheEnabled")=32
    Set application="/api/atlas"
    If '##class(Security.Applications).Exists(application) {
        Return ##class(Security.Applications).Create(application,.configuration)
    }
    Return ##class(Security.Applications).Modify(application,.configuration)
}
}
