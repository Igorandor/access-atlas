Class Atlas.Telemetry Extends %RegisteredObject
{
/// Collect an evidence sample without invoking external programs.
ClassMethod Read() As %String [ Language = python ]
{
    import json
    import os
    import platform
    import shutil
    import time
    import iris

    manager = str(iris.system.Util.ManagerDirectory())
    volume = shutil.disk_usage(manager)
    sample = dict(sampledAt=time.time(), platform=platform.system(),
                  scope="IRIS-visible host counters; container quotas may differ",
                  disk=dict(path=manager, total=volume.total, used=volume.used, free=volume.free))
    if platform.system() != "Linux":
        sample["notice"] = "This platform provides disk evidence only; native IRIS APIs remain available."
    else:
        with open("/proc/meminfo", encoding="ascii") as source:
            memory = {}
            for line in source:
                tokens = line.split()
                if tokens[0] in ("MemTotal:", "MemAvailable:"):
                    memory[tokens[0][:-1]] = int(tokens[1]) * 1024
        with open("/proc/stat", encoding="ascii") as source:
            ticks = list(map(int, source.readline().split()[1:9]))
        with open("/proc/uptime", encoding="ascii") as source:
            uptime = float(source.readline().split()[0])
        sample.update(
            memory=dict(total=memory.get("MemTotal", 0), available=memory.get("MemAvailable", 0)),
            cpu=dict(totalTicks=sum(ticks), idleTicks=ticks[3] + ticks[4],
                     logicalCount=os.cpu_count(), loadAverage=list(os.getloadavg())),
            uptimeSeconds=uptime
        )
    return json.dumps(sample)
}

/// Return only the final bounded window from one of two named sources.
ClassMethod Logs(source As %String = "messages", limit As %Integer = 200) As %String [ Language = python ]
{
    import json
    import os
    import re
    import iris

    if source not in ("messages", "alerts"):
        raise ValueError("Unsupported evidence source")
    filename = os.path.join(str(iris.system.Util.ManagerDirectory()), source + ".log")
    count = min(500, max(1, int(limit)))
    try:
        with open(filename, "rb") as stream:
            size = stream.seek(0, 2)
            offset = max(0, size - 1048576)
            stream.seek(offset)
            window = stream.read(1048576)
    except FileNotFoundError:
        return json.dumps(dict(source=source, lines=[], notice="No file exists for this log source yet."))
    if offset:
        # Discard a partial leading line inside the window, never read beyond it.
        split = window.find(b"\n")
        window = window[split + 1:] if split >= 0 else b""
    clean = []
    for line in window.decode("utf-8", errors="replace").splitlines()[-count:]:
        clean.append(re.sub(r"(?i)\b(password|token|secret)([=: ]+)(\S+)", r"\1\2[redacted]", line))
    return json.dumps(dict(source=source, lines=clean, bytes=size, bounded=True))
}
}
