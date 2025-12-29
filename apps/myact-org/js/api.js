/* MyACT API Functions */

async function fetchAPI(endpoint, method, data) {
	const encodedEndpoint = endpoint.split('/').map(part => encodeURIComponent(part)).join('/');
	const url = sotaapp2 + encodedEndpoint;
	const options = {
		method: method,
		body: method === 'POST' || method === 'PUT' ? data : undefined
	};

	try {
		const response = await fetch(url, options);
		if (!response.ok) {
			throw new Error(`Error ${response.status}: ${response.statusText}`);
		}

		if (method === 'DELETE') {
			return {}
		}
		let res = await response.json();
		return res;
	} catch (error) {
		console.error(`API ${endpoint} request failed:`, error);
		return null;
	}
}
