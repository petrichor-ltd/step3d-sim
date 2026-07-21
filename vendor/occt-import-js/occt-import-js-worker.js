importScripts ('occt-import-js.js');

onmessage = async function (ev)
{
	try {
		let modulOverrides = {
			locateFile: function (path) {
				return path;
			}
		};
		let occt = await occtimportjs (modulOverrides);
		let result = occt.ReadFile (ev.data.format, ev.data.buffer, ev.data.params);
		postMessage (result);
	} catch (error) {
		postMessage ({ __error: error && error.message ? error.message : 'STEP parser failed' });
	}
};
