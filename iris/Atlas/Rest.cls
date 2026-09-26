Class Atlas.Rest Extends %CSP.REST
{
Parameter UseSession = 0;
Parameter CHARSET = "utf-8";
XData UrlMap
{
<Routes>
<Route Url="/logs" Method="GET" Call="LogEvidence"/>
<Route Url="/telemetry" Method="GET" Call="HostEvidence"/>
</Routes>
}
ClassMethod OnPreDispatch(pUrl As %String, pMethod As %String, ByRef pContinue As %Boolean) As %Status
{
    Set %response.ContentType="application/json"
    Set pContinue=$SYSTEM.Security.Check("%Admin_Operate","USE")
    If 'pContinue {
        Set %response.Status="403 Forbidden"
        Write "{""error"":""Operating permission is required for Atlas evidence.""}"
    }
    Return $$$OK
}
ClassMethod HostEvidence() As %Status
{
    Write ##class(Atlas.Telemetry).Read()
    Return $$$OK
}
ClassMethod LogEvidence() As %Status
{
    Set requested=$Get(%request.Data("source",1),"messages")
    If (requested="messages")!(requested="alerts") {
        Set lines=+$Get(%request.Data("limit",1),200)
        Write ##class(Atlas.Telemetry).Logs(requested,lines)
    } Else {
        Set %response.Status="400 Bad Request"
        Write "{""error"":""Select messages or alerts.""}"
    }
    Return $$$OK
}
}
