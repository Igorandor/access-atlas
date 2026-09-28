# Inspect SQL privileges

The resource access map does not include SQL grants. Use **Access review → SQL privileges** to read these separately for one namespace and one account or role.

1. Enter the namespace and grantee. `USER` is the initial namespace; replace it with the namespace you need to review. Suggestions come from the current resource capture, but you can type a name directly when that capture is unavailable.
2. Read the two result sections: object privileges and SQL administrative privileges. Each identifies the endpoint and time of its own read. An unavailable source does not invalidate a successful read from the other source.
3. Inspect the privilege, its origin and its grant/admin option. Origins are IRIS's labels, not paths reconstructed by Atlas. “Unknown” is distinct from “No”.
4. Use the local filter to find an object or privilege, then export the captured evidence. The export covers the whole captured result, not only filtered rows. It includes the configured instance, namespace, grantee, timestamps, source status and limitations.

The two reads include system-defined object privileges and request at most 500 rows per source. A result reaching that bound may be truncated. IRIS does not supply a total or continuation cursor for these endpoints; Atlas does not claim a complete inventory.

An empty response means no rows were returned for the entered scope. Check the name as well: on the tested IRIS 2026.2 instance, a nonexistent grantee also returned an empty successful response. A column-privilege indicator means additional column details exist; this view does not expand them. Neither an empty result nor the absence of a particular row proves denied runtime access.

These are current, separate observations, not an atomic snapshot or a historical campaign capture. They remain in browser memory until you edit the namespace or grantee, replace them with a new capture, or end the session. Export the evidence first if you need to retain it; exporting does not clear the current results. The view does not grant, revoke, impersonate accounts, run SQL or change IRIS settings. The operator needs `%Admin_Secure:U` for both native reads; namespace-list permission is not required because the namespace can be entered directly.

If the session has expired when you select **Read SQL privileges**, Atlas returns to sign-in and removes the previous report from the workspace. After signing in, enter the scope and request a new read. A temporary server failure is different: the prior capture retains its original timestamp and can still be exported. Files already downloaded are unaffected.

## Native API behavior

The view uses `GET /api/admin/v2/security/sql-privileges` and `GET /api/admin/v2/security/sql-admin-privileges`. The bundled OpenAPI describes object columns as `Name` and `Privilege`, while the tested IRIS 2026.2 response uses `Object` and `Action`. Atlas handles these two explicit formats; conflicting values are reported as malformed evidence. SQL administrative rows use `Privilege`.

SQL grants apply within a namespace, and runtime enforcement depends on the access mechanism and configuration. See the platform's [GRANT reference](https://irisdocs.intersystems.com/irislatest/csp/docbook/DocBook.UI.Page.cls?KEY=RSQL_grant) and [SQL privilege catalog](https://irisdocs.intersystems.com/irislatest/csp/documatic/%25CSP.Documatic.cls?CLASSNAME=%25Library.SQLCatalogPriv&LIBRARY=%25SYS).

To repeat the bounded, read-only native probe, set `IRIS_URL`, `IRIS_TEST_USER` and `IRIS_TEST_PASSWORD`, then run `node --import tsx scripts/live-sql.ts`. Optional `IRIS_SQL_NAMESPACE` and `IRIS_SQL_GRANTEE` choose its scope. The script checks up to five rows per source and does not modify accounts, grants, tables or data.
