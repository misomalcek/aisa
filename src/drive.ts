export async function fetchDriveFiles(accessToken: string, query = '') {
  try {
    let q = "(mimeType = 'text/plain' or mimeType = 'application/vnd.google-apps.document' or mimeType = 'application/json')";
    if (query) {
      q += ` and name contains '${query.replace(/'/g, "\\'")}'`;
    }
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,modifiedTime,size)&pageSize=30`;
    
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google Drive API returned ${response.status}: ${errorText}`);
    }
    const data = await response.json();
    return data.files || [];
  } catch (error) {
    console.error('Error fetching from Google Drive:', error);
    return [];
  }
}

export async function fetchDriveFileContent(accessToken: string, fileId: string, mimeType: string): Promise<string> {
  try {
    let url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    if (mimeType === 'application/vnd.google-apps.document') {
      url = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`;
    }
    
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    
    if (!response.ok) {
      return `[Error loading file content: ${response.statusText}]`;
    }
    return await response.text();
  } catch (error) {
    console.error(`Error loading content for file ${fileId}:`, error);
    return `[Exception loading file content]`;
  }
}

export async function listNotes(accessToken: string) {
  let folderId = '';
  const folderSearchUrl = `https://www.googleapis.com/drive/v3/files?q=name%3D%27Aisa+Notes%27+and+mimeType%3D%27application%2Fvnd.google-apps.folder%27+and+trashed%3Dfalse&fields=files(id)`;
  const searchRes = await fetch(folderSearchUrl, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const searchData = await searchRes.json();
  
  if (searchData.files && searchData.files.length > 0) {
    folderId = searchData.files[0].id;
  } else {
    return [];
  }

  const listUrl = `https://www.googleapis.com/drive/v3/files?q=%27${folderId}%27+in+parents+and+mimeType%3D%27text%2Fplain%27+and+trashed%3Dfalse&fields=files(id,name,modifiedTime)&pageSize=50`;
  const listRes = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const listData = await listRes.json();
  const files = listData.files || [];

  const notes = await Promise.all(files.map(async (f: any) => {
    const content = await fetchDriveFileContent(accessToken, f.id, 'text/plain');
    return {
      id: f.id,
      title: f.name.replace(/\.txt$/, ''),
      content,
      modifiedTime: f.modifiedTime
    };
  }));

  return notes;
}

export async function createNote(accessToken: string, title: string, content: string) {
  let folderId = '';
  const folderSearchUrl = `https://www.googleapis.com/drive/v3/files?q=name%3D%27Aisa+Notes%27+and+mimeType%3D%27application%2Fvnd.google-apps.folder%27+and+trashed%3Dfalse&fields=files(id)`;
  const searchRes = await fetch(folderSearchUrl, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const searchData = await searchRes.json();
  
  if (searchData.files && searchData.files.length > 0) {
    folderId = searchData.files[0].id;
  } else {
    const createFolderRes = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Aisa Notes',
        mimeType: 'application/vnd.google-apps.folder'
      })
    });
    const folderData = await createFolderRes.json();
    folderId = folderData.id;
  }

  const boundary = 'foo_bar_baz';
  const metadataStr = JSON.stringify({
    name: `${title}.txt`,
    parents: [folderId],
    mimeType: 'text/plain'
  });
  
  const multipartBody = 
    `\r\n--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${metadataStr}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: text/plain\r\n\r\n` +
    `${content}\r\n` +
    `--${boundary}--`;

  const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`
    },
    body: multipartBody
  });

  if (!uploadRes.ok) {
    throw new Error(`Failed to upload note to Drive: ${await uploadRes.text()}`);
  }

  const fileData = await uploadRes.json();
  return fileData.id;
}

export async function updateNote(accessToken: string, fileId: string, title: string, content: string) {
  await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: `${title}.txt`
    })
  });

  const uploadRes = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'text/plain'
    },
    body: content
  });

  if (!uploadRes.ok) {
    throw new Error(`Failed to update note content: ${await uploadRes.text()}`);
  }
}

export async function deleteNote(accessToken: string, fileId: string) {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) {
    throw new Error(`Failed to delete note: ${await response.text()}`);
  }
}
