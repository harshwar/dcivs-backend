const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

const PINATA_API_KEY = process.env.PINATA_API_KEY;
const PINATA_SECRET_API_KEY = process.env.PINATA_API_SECRET;
const PINATA_BASE_URL = "https://api.pinata.cloud/pinning";

async function pinFileToIPFS(filePath) {
    const formData = new FormData();
    formData.append("file", fs.createReadStream(filePath));
    
    const response = await axios.post(`${PINATA_BASE_URL}/pinFileToIPFS`, formData, {
        headers: {
            ...formData.getHeaders(),
            pinata_api_key: PINATA_API_KEY,
            pinata_secret_api_key: PINATA_SECRET_API_KEY,
        },
    });
    return response.data.IpfsHash;
}

async function pinJSONToIPFS(jsonMetadata) {
    const response = await axios.post(`${PINATA_BASE_URL}/pinJSONToIPFS`, jsonMetadata, {
        headers: {
            pinata_api_key: PINATA_API_KEY,
            pinata_secret_api_key: PINATA_SECRET_API_KEY,
        },
    });
    return response.data.IpfsHash;
}

module.exports = { pinFileToIPFS, pinJSONToIPFS };
