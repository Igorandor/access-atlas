Class Atlas.Installer Extends %RegisteredObject
{
ClassMethod Install() As %Status
{
    New $Namespace
    Set $Namespace = "%SYS"
    Set props("DispatchClass")="Atlas.Rest",props("NameSpace")="%SYS"
    Set props("AutheEnabled")=32,props("Enabled")=1,props("Resource")="%Admin_Operate"
    If ##class(Security.Applications).Exists("/api/atlas") {
        Quit ##class(Security.Applications).Modify("/api/atlas",.props)
    }
    Quit ##class(Security.Applications).Create("/api/atlas",.props)
}
}
