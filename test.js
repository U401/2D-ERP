try {
  const cart = [{id: 1}];
  const items = cart.map(item => ({
    val: 1,
    len: items.length
  }));
  console.log("Success", items);
} catch (e) {
  console.log("Error:", e.message);
}
