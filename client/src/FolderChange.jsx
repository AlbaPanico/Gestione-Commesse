const onFolderChange = async (e) => {
  const files = Array.from(e.target.files);
  console.log("Files selezionati:", files);
  if (files.length === 0) return;
  
  const folderName = files[0].webkitRelativePath.split("/")[0];
  
  // Filtra solo i file CSV
  const csvFilesArray = files.filter((file) =>
    file.name.toLowerCase().endsWith(".csv")
  );
  if (csvFilesArray.length === 0) {
    alert("La cartella selezionata non contiene file CSV.");
    return;
  }

  // Leggi il contenuto di ogni file CSV
  const readPromises = csvFilesArray.map((file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const parsed = parseCSV(reader.result);
        resolve({
          name: file.name,
          size: file.size,
          parsedContent: parsed,
        });
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  });

  try {
    const results = await Promise.all(readPromises);
    console.log("File CSV letti:", results);
    // Invia al parent, ad esempio, tramite onFolderSelected
    onFolderSelected({ folderName, csvFiles: results });
  } catch (error) {
    console.error("Errore nella lettura dei file CSV:", error);
  }
};
